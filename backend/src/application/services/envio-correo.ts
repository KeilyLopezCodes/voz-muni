import { debeDescartarse, proximoIntento } from '../../domain/notificaciones/correo-saliente';
import type { EnviadorCorreo } from '../../domain/notificaciones/enviador-correo';
import { renderizar } from '../../domain/notificaciones/plantilla';
import type { CorreoReclamado, CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { PlantillaRepository } from '../../domain/repositories/plantilla-repository';

export interface OpcionesCorreo {
  ticketId?: number | null;
  expiraEn?: Date | null; // vencimiento del token del enlace: pasado ese instante el correo se descarta
}

// Bandeja de salida (SPEC 34): sin ella (pruebas), se envía directo como antes.
export interface BandejaSalida {
  repositorio: CorreoSalienteRepository;
  ahora: () => Date;
}

const LOTE = 50;

// Envía un correo a partir de una plantilla de plantillas_notificacion (RF-33). Con la bandeja de salida, cada correo
// queda registrado ya renderizado en correos_salientes, se intenta enviar enseguida y, si falla, lo reintenta el job
// de correos hasta completar 3 intentos.
export class EnvioCorreo {
  constructor(
    private readonly plantillas: PlantillaRepository,
    private readonly enviador: EnviadorCorreo,
    private readonly registrarError: (mensaje: string) => void,
    private readonly bandeja?: BandejaSalida,
  ) {}

  async enviar(clave: string, para: string, variables: Record<string, string>): Promise<void> {
    const correo = await this.renderizar(clave, variables);
    await this.enviador.enviar({ para, asunto: correo.asunto, texto: correo.texto, html: correo.html });
  }

  // Devuelve false si falla. El fallo queda en el log con el usuario_id y nunca con el contenido (que puede llevar un token).
  async intentar(
    clave: string,
    para: string,
    variables: Record<string, string>,
    usuarioId: number,
    opciones: OpcionesCorreo = {},
  ): Promise<boolean> {
    try {
      if (!this.bandeja) {
        await this.enviar(clave, para, variables);
        return true;
      }
      const correo = await this.renderizar(clave, variables);
      const id = await this.bandeja.repositorio.insertar(
        {
          plantillaClave: clave,
          para,
          asunto: correo.asunto,
          texto: correo.texto,
          html: correo.html,
          ticketId: opciones.ticketId ?? null,
          usuarioId,
          expiraEn: opciones.expiraEn ?? null,
        },
        this.bandeja.ahora(),
      );
      return await this.despachar({
        id,
        plantillaClave: clave,
        para,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        ticketId: opciones.ticketId ?? null,
        usuarioId,
        expiraEn: opciones.expiraEn ?? null,
        intentos: 0,
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.registrarError(`No se pudo enviar el correo ${clave} al usuario_id ${usuarioId}: ${detalle}`);
      return false;
    }
  }

  // Sale sin bloquear al que llama: la respuesta HTTP no espera al SMTP.
  sinEsperar(
    clave: string,
    para: string,
    variables: Record<string, string>,
    usuarioId: number,
    opciones: OpcionesCorreo = {},
  ): void {
    void this.intentar(clave, para, variables, usuarioId, opciones);
  }

  // Lo llama el job de correos: reintenta los pendientes vencidos. Devuelve cuántos envió.
  async reintentarPendientes(): Promise<number> {
    if (!this.bandeja) {
      return 0;
    }
    let enviados = 0;
    for (;;) {
      const lote = await this.bandeja.repositorio.reclamarVencidos(this.bandeja.ahora(), LOTE);
      for (const correo of lote) {
        if (await this.despachar(correo)) {
          enviados++;
        }
      }
      if (lote.length < LOTE) {
        return enviados;
      }
    }
  }

  private async despachar(correo: CorreoReclamado): Promise<boolean> {
    const { repositorio, ahora } = this.bandeja!;
    if (debeDescartarse(correo.expiraEn, ahora())) {
      await repositorio.marcarDescartado(correo.id, ahora());
      return false;
    }
    try {
      await this.enviador.enviar({ para: correo.para, asunto: correo.asunto, texto: correo.texto, html: correo.html });
      await repositorio.marcarEnviado(correo.id, ahora());
      return true;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      const proximo = proximoIntento(correo.intentos + 1, ahora());
      await repositorio.registrarFallo(correo.id, detalle, proximo, ahora());
      this.registrarError(
        proximo === null
          ? `El correo ${correo.plantillaClave} al usuario_id ${correo.usuarioId} falló definitivamente: ${detalle}`
          : `No se pudo enviar el correo ${correo.plantillaClave} al usuario_id ${correo.usuarioId}; se reintentará: ${detalle}`,
      );
      return false;
    }
  }

  private async renderizar(clave: string, variables: Record<string, string>) {
    // Se lee en cada envío: un cambio de la plantilla en la base aplica sin reiniciar.
    const plantilla = await this.plantillas.buscarPorClave(clave);
    if (!plantilla) {
      throw new Error(`No existe la plantilla ${clave}`);
    }
    return renderizar(plantilla, variables);
  }
}
