import { z } from 'zod';
import { PRIORIDADES } from '../../domain/ticket/prioridad';

export const idCategoriaSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Exactamente 4 plazos, cada uno strict. Que las horas sean enteros ≥ 1, que estén las 4 prioridades y el orden
// entre ellas lo valida el dominio (MATRIZ_SLA_INVALIDA con detalles); aquí solo la forma.
export const politicasSlaSchema = z
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
