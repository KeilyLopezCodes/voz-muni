import type { TipoPlazo } from './vencimientos';

// Datos de SLA que ven los internos en bandejas y detalle (SPEC 30 y 32). "Vencido" lo calcula el frontend con la
// hora actual, para que el dato no quede viejo en la caché.
export interface SlaLectura {
  venceRespuesta: string | null; // ISO 8601 en UTC
  primeraRespuestaEn: string | null;
  venceResolucion: string | null; // null en pausa
  pausado: boolean; // estado === 'en_espera'
  restanteMinutosEnPausa: number | null;
  escalado: boolean;
  escaladoEn: string | null;
  escaladoPor: TipoPlazo | null;
}
