import type { Clock } from '../../domain/health/clock';
import { renderizar } from '../../domain/notificaciones/plantilla';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { PlantillaRepository } from '../../domain/repositories/plantilla-repository';
import type { DespachoCorreosService } from './despacho-correos.service';

export interface DestinoCorreo {
  para: string;
  usuarioId?: number;
  ticketId?: number;
  expiraEn?: Date; // el vencimiento del token del enlace: vencido, el correo se descarta en lugar de enviarse
}

export interface OpcionesNotificador {
  // Las pruebas esperan el primer intento para comprobar el enviador falso sin depender de tiempos.
  despachoSincronico: boolean;
}

// Único camino de envío de los correos (RF-31, SPEC 34). Cada caso de uso:
//  1. dentro de su transacción, `encolar` con el repositorio de esa transacción: si se revierte, el correo tampoco
//     existe;
//  2. después del commit, `despachar` sin esperar: la respuesta HTTP no espera al SMTP.
// Un fallo de envío nunca cambia la respuesta del caso de uso: el job de correos lo reintenta.
export class NotificadorCorreo {
  constructor(
    private readonly plantillas: PlantillaRepository,
    // Fuera de una transacción (un aviso de algo que ya ocurrió) se encola con este.
    private readonly correos: CorreoSalienteRepository,
    private readonly despacho: Pick<DespachoCorreosService, 'despacharIds'>,
    private readonly clock: Clock,
    private readonly log: (mensaje: string) => void,
    private readonly opciones: OpcionesNotificador = { despachoSincronico: false },
  ) {}

  // Renderiza la plantilla (se lee en cada envío, SPEC 09) e inserta la fila. Devuelve el id, o null si la plantilla
  // no existe o le falta una variable: se registra en el log y el caso de uso sigue.
  async encolar(
    clave: string,
    variables: Record<string, string>,
    destino: DestinoCorreo,
    correos: CorreoSalienteRepository = this.correos,
  ): Promise<number | null> {
    const plantilla = await this.plantillas.buscarPorClave(clave);
    if (!plantilla) {
      this.log(`No existe la plantilla ${clave}: no se encoló el correo al usuario_id ${destino.usuarioId ?? '-'}`);
      return null;
    }
    let renderizado;
    try {
      renderizado = renderizar(plantilla, variables);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.log(`No se pudo armar el correo ${clave} al usuario_id ${destino.usuarioId ?? '-'}: ${detalle}`);
      return null;
    }
    return correos.insertar({
      plantillaClave: clave,
      para: destino.para,
      asunto: renderizado.asunto,
      texto: renderizado.texto,
      html: renderizado.html,
      ticketId: destino.ticketId ?? null,
      usuarioId: destino.usuarioId ?? null,
      expiraEn: destino.expiraEn ?? null,
    });
  }

  // Después del commit. No se espera (salvo con despachoSincronico): el primer intento corre aparte.
  async despachar(ids: readonly (number | null)[]): Promise<void> {
    const tarea = this.intentarAhora(ids);
    if (this.opciones.despachoSincronico) {
      await tarea;
    }
  }

  // Después del commit, cuando quien llama necesita saber si el correo salió (las invitaciones avisan si falló).
  despacharYEsperar(ids: readonly (number | null)[]): Promise<boolean> {
    return this.intentarAhora(ids);
  }

  private async intentarAhora(ids: readonly (number | null)[]): Promise<boolean> {
    const validos = ids.filter((id): id is number => id !== null);
    if (validos.length === 0) {
      return false;
    }
    try {
      return await this.despacho.despacharIds(validos, this.clock.now());
    } catch (error) {
      // Sin base, por ejemplo: el correo sigue pendiente y lo reintenta el job.
      const detalle = error instanceof Error ? error.message : String(error);
      this.log(`No se pudo despachar los correos ${validos.join(', ')}: ${detalle}`);
      return false;
    }
  }
}
