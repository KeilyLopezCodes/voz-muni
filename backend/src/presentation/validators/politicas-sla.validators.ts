import { z } from 'zod';
import { PRIORIDADES } from '../../domain/ticket/prioridad';

export const idCategoriaSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Solo la forma: las reglas de la matriz (horas enteras, respuesta ≤ resolución, monotonía) son del dominio y
// responden MATRIZ_SLA_INVALIDA con todos los problemas.
export const matrizSlaSchema = z
  .object({
    plazos: z
      .array(
        z
          .object({
            prioridad: z.enum(PRIORIDADES),
            horasRespuesta: z.number(),
            horasResolucion: z.number(),
          })
          .strict(),
      )
      .length(PRIORIDADES.length),
  })
  .strict();
