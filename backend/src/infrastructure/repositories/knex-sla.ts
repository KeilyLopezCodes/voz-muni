import type { SlaLectura } from '../../domain/sla/vencimientos';
import type { TipoPlazo } from '../../domain/ticket/ticket';

// Columnas del SLA para las bandejas y el detalle (SPEC 30), con el alias t de tickets.
export const COLUMNAS_SLA_LECTURA = [
  't.vence_respuesta',
  't.primera_respuesta_en',
  't.vence_resolucion',
  't.sla_restante_minutos',
  't.escalado',
  't.escalado_en',
  't.escalado_por',
] as const;

export interface FilaSlaLectura {
  vence_respuesta: Date | null;
  primera_respuesta_en: Date | null;
  vence_resolucion: Date | null;
  sla_restante_minutos: number | null;
  escalado: boolean;
  escalado_en: Date | null;
  escalado_por: TipoPlazo | null;
}

export function slaDeFila(fila: FilaSlaLectura): SlaLectura {
  return {
    venceRespuesta: fila.vence_respuesta,
    primeraRespuestaEn: fila.primera_respuesta_en,
    venceResolucion: fila.vence_resolucion,
    restanteMinutosEnPausa: fila.sla_restante_minutos,
    escalado: fila.escalado,
    escaladoEn: fila.escalado_en,
    escaladoPor: fila.escalado_por,
  };
}
