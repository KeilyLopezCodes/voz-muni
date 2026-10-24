import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Solicitudes de traslado entre dependencias (RF-15, SPEC 21). El efecto sobre la queja lo aplica
// Ticket.trasladar (SPEC 04); aquí van las reglas de la solicitud.

export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'retirada', 'sin_efecto'] as const;

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

// Los mismos orígenes que Ticket.trasladar.
export const ORIGENES_TRASLADO: readonly EstadoTicket[] = ['asignada', 'en_proceso'];

export const MOTIVO_TRASLADO_MAX = 1000;

// Devuelve el motivo recortado. La sugerida es opcional, pero no puede ser la dependencia de origen.
export function validarSolicitud({
  motivo,
  dependenciaOrigenId,
  dependenciaSugeridaId,
}: {
  motivo: string;
  dependenciaOrigenId: number;
  dependenciaSugeridaId: number | null;
}): { motivo: string } {
  const recortado = typeof motivo === 'string' ? motivo.trim() : '';
  if (recortado === '' || [...recortado].length > MOTIVO_TRASLADO_MAX) {
    throw new ReglaDeNegocioError('MOTIVO_REQUERIDO', `El motivo es obligatorio, hasta ${MOTIVO_TRASLADO_MAX} caracteres`);
  }
  if (dependenciaSugeridaId !== null && dependenciaSugeridaId === dependenciaOrigenId) {
    throw new ReglaDeNegocioError('DEPENDENCIA_INVALIDA', 'La dependencia sugerida es la misma de origen');
  }
  return { motivo: recortado };
}

// Solo una solicitud pendiente cambia de estado; las demás son finales.
export function exigirPendiente(estado: EstadoSolicitud): void {
  if (estado !== 'pendiente') {
    throw new ReglaDeNegocioError('TRASLADO_YA_RESUELTO', `La solicitud ya está ${estado}`);
  }
}

export function puedeTrasladarse(estadoTicket: EstadoTicket): boolean {
  return ORIGENES_TRASLADO.includes(estadoTicket);
}
