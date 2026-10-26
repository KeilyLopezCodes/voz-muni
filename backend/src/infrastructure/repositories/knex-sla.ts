import type { SlaLectura } from '../../domain/sla/vencimientos';

// Columnas del SLA para las bandejas y el detalle (SPEC 30), con el alias t de tickets.
export const COLUMNAS_SLA_LECTURA = [
  't.vence_respuesta',
  't.primera_respuesta_en',
  't.vence_resolucion',
  't.sla_restante_minutos',
] as const;

export interface FilaSlaLectura {
  vence_respuesta: Date | null;
  primera_respuesta_en: Date | null;
  vence_resolucion: Date | null;
  sla_restante_minutos: number | null;
}

export function slaDeFila(fila: FilaSlaLectura): SlaLectura {
  return {
    venceRespuesta: fila.vence_respuesta,
    primeraRespuestaEn: fila.primera_respuesta_en,
    venceResolucion: fila.vence_resolucion,
    restanteMinutosEnPausa: fila.sla_restante_minutos,
  };
}
