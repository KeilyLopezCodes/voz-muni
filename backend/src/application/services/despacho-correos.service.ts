import { debeDescartarse, MAX_INTENTOS, proximoIntento } from '../../domain/notificaciones/correo-saliente';
import type { EnviadorCorreo } from '../../domain/notificaciones/enviador-correo';
import type { CorreoReclamado, CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { enmascararEmail } from '../../domain/usuarios/enmascarar-contacto';

export const TAMANO_LOTE_CORREOS = 50;

type Resultado = 'enviado' | 'descartado' | 'pendiente' | 'fallido';

// Envío de los correos de la bandeja de salida (RF-31, SPEC 34). Junto con NotificadorCorreo es el único lugar que
// usa EnviadorCorreo. El correo queda bloqueado (FOR UPDATE SKIP LOCKED) mientras se envía: el envío inmediato, el
// job y otras instancias nunca envían el mismo correo dos veces.
export class DespachoCorreosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly enviador: EnviadorCorreo,
    private readonly log: (mensaje: string) => void,
  ) {}

  // El primer intento, en cuanto se confirmó la transacción del caso de uso. Devuelve true si todos salieron.
  async despacharIds(ids: readonly number[], ahora: Date): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }
    const resultados = await this.transaccion.ejecutar(async ({ correosSalientes }) => {
      const reclamados = await correosSalientes.reclamarPorId(ids);
      const hechos: Resultado[] = [];
      for (const correo of reclamados) {
        hechos.push(await this.intentar(correo, correosSalientes, ahora));
      }
      return hechos;
    });
    return resultados.length === ids.length && resultados.every((r) => r === 'enviado');
  }

  // Reintentos del job: por lotes hasta que no queden vencidos. Devuelve cuántos procesó.
  async procesar(ahora: Date): Promise<number> {
    let procesados = 0;
    for (;;) {
      const lote = await this.transaccion.ejecutar(async ({ correosSalientes }) => {
        const reclamados = await correosSalientes.reclamarVencidos(ahora, TAMANO_LOTE_CORREOS);
        for (const correo of reclamados) {
          await this.intentar(correo, correosSalientes, ahora);
        }
        return reclamados.length;
      });
      procesados += lote;
      if (lote < TAMANO_LOTE_CORREOS) {
        return procesados;
      }
    }
  }

  private async intentar(correo: CorreoReclamado, repo: CorreoSalienteRepository, ahora: Date): Promise<Resultado> {
    if (debeDescartarse(correo.expiraEn, ahora)) {
      await repo.marcarDescartado(correo.id, ahora);
      return 'descartado';
    }
    try {
      await this.enviador.enviar({ para: correo.para, asunto: correo.asunto, texto: correo.texto, html: correo.html });
      await repo.marcarEnviado(correo.id, ahora);
      return 'enviado';
    } catch (error) {
      // El log lleva la plantilla y el usuario_id, nunca el contenido (que puede llevar un token).
      const detalle = error instanceof Error ? error.message : String(error);
      const intentos = correo.intentos + 1;
      const proximo = proximoIntento(intentos, ahora);
      await repo.registrarFallo(correo.id, detalle, proximo, ahora);
      const quien = `usuario_id ${correo.usuarioId ?? '-'}`;
      if (proximo === null) {
        this.log(
          `No se pudo enviar el correo ${correo.plantillaClave} al ${quien}: ${detalle}. Quedó fallido tras ` +
            `${MAX_INTENTOS} intentos (para ${enmascararEmail(correo.para)}, ticket_id ${correo.ticketId ?? '-'})`,
        );
        return 'fallido';
      }
      this.log(
        `No se pudo enviar el correo ${correo.plantillaClave} al ${quien}: ${detalle}. ` +
          `Intento ${intentos} de ${MAX_INTENTOS}; el próximo, el ${proximo.toISOString()}`,
      );
      return 'pendiente';
    }
  }
}
