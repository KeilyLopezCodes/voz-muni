import { exigirComentable } from '../comentarios/comentario';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Orígenes y cupos de los adjuntos (RF-06, RF-20, SPEC 24). El origen lo decide el backend, no el cliente, para
// que nadie se salte los cupos.

export const ORIGENES_ADJUNTO = ['registro', 'atencion'] as const;

export type OrigenAdjunto = (typeof ORIGENES_ADJUNTO)[number];

export const LIMITE_POR_ORIGEN = 5;

export const VENTANA_BORRADO_MS = 5 * 60 * 1000;

export interface ContextoSubida {
  estadoTicket: EstadoTicket;
  usuarioId: number;
  solicitanteId: number;
  registradoPor: number | null;
}

// `registro`: el solicitante o quien registró la queja, mientras sigue en `nueva` (el formulario sube los archivos
// en otra petición, justo después de crearla). Fuera de `nueva` el solicitante ya no adjunta: responde en
// comentarios (SPEC 23). Cualquier otro caso es `atencion`.
export function decidirOrigen({ estadoTicket, usuarioId, solicitanteId, registradoPor }: ContextoSubida): OrigenAdjunto {
  const esDelRegistro = usuarioId === solicitanteId || usuarioId === registradoPor;
  if (esDelRegistro && estadoTicket === 'nueva') {
    return 'registro';
  }
  if (usuarioId === solicitanteId) {
    throw new ReglaDeNegocioError('ADJUNTOS_CERRADOS', 'Ya no se pueden agregar archivos al registro de la queja');
  }
  return 'atencion';
}

// Los del registro son siempre públicos. En la atención, una queja final solo admite internos, como los
// comentarios (SPEC 23).
export function exigirVisibilidad(origen: OrigenAdjunto, estadoTicket: EstadoTicket, interno: boolean): void {
  if (origen === 'registro' && interno) {
    throw new ReglaDeNegocioError('VALIDACION', 'Los adjuntos del registro siempre son públicos');
  }
  if (origen === 'atencion') {
    exigirComentable(estadoTicket, interno);
  }
}

// Hasta 5 por origen y por queja. Si la petición no cabe, no se guarda ninguno, y `detalles` dice cuántos caben.
export function exigirCupo(existentes: number, nuevos: number): void {
  if (existentes + nuevos > LIMITE_POR_ORIGEN) {
    const restantes = Math.max(0, LIMITE_POR_ORIGEN - existentes);
    throw new ReglaDeNegocioError('LIMITE_ADJUNTOS', `Solo caben ${restantes} archivos más`, [
      { campo: 'restantes', problema: String(restantes) },
    ]);
  }
}

// El autor borra durante 5 minutos desde que lo subió; reutiliza EDICION_VENCIDA de SPEC 23.
export function exigirBorrable(creadoEn: Date, ahora: Date): void {
  if (!esBorrable(creadoEn, ahora)) {
    throw new ReglaDeNegocioError('EDICION_VENCIDA', 'Pasaron más de 5 minutos: el adjunto ya no se puede borrar');
  }
}

export function esBorrable(creadoEn: Date, ahora: Date): boolean {
  return ahora.getTime() <= creadoEn.getTime() + VENTANA_BORRADO_MS;
}
