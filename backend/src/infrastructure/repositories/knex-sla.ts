// Columna `sla` (SlaLectura) armada en SQL, para las bandejas y el detalle (SPEC 30 y 32).
const iso = (columna: string) => `to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const COLUMNA_SLA = `jsonb_build_object(
  'venceRespuesta', ${iso('t.vence_respuesta')},
  'primeraRespuestaEn', ${iso('t.primera_respuesta_en')},
  'venceResolucion', ${iso('t.vence_resolucion')},
  'pausado', t.estado = 'en_espera',
  'restanteMinutosEnPausa', t.sla_restante_minutos,
  'escalado', t.escalado,
  'escaladoEn', ${iso('t.escalado_en')},
  'escaladoPor', t.escalado_por
) as sla`;
