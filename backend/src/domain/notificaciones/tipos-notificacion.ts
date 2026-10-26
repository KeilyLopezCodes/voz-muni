// Tipos de notificación dentro de la aplicación (RF-32). El texto no se guarda: lo arma el frontend con `tipo` y
// `datos` y los archivos de traducción. notificaciones.tipo no tiene CHECK (SPEC 03): un tipo nuevo se agrega aquí.

// Alertas y escalamiento del SLA (SPEC 31 y 32).
export const TIPOS_NOTIFICACION_SLA = ['sla_alerta_respuesta', 'sla_alerta_resolucion', 'sla_escalamiento'] as const;

// Avisos a los usuarios internos (SPEC 36).
export const TIPOS_NOTIFICACION_INTERNA = [
  'asignacion_recibida', // {}
  'asignacion_retirada', // {}
  'comentario_nuevo', // { cantidad, incluyeInternas }, agrupada por usuario y queja mientras no se lee
  'respuesta_vecino', // {}
  'queja_reabierta', // {}
  'traslado_solicitado', // { solicitudId }
  'traslado_resuelto', // { solicitudId, resultado }
  'encuesta_baja', // { calificacion }, a los coordinadores (SPEC 39)
] as const;

export const TIPOS_NOTIFICACION = [...TIPOS_NOTIFICACION_SLA, ...TIPOS_NOTIFICACION_INTERNA] as const;

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];
export type TipoNotificacionInterna = (typeof TIPOS_NOTIFICACION_INTERNA)[number];

export type ResultadoTraslado = 'aprobada' | 'rechazada' | 'sin_efecto';

// La retención de las leídas (notificaciones_retencion_dias, SPEC 36): un entero de 1 a 365. null si no lo es.
export const RETENCION_MIN_DIAS = 1;
export const RETENCION_MAX_DIAS = 365;

export function retencionValida(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= RETENCION_MIN_DIAS && valor <= RETENCION_MAX_DIAS
    ? valor
    : null;
}
