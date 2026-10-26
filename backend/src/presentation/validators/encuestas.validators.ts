import { z } from 'zod';
import { CALIFICACION_MAX, CALIFICACION_MIN, COMENTARIO_MAX } from '../../domain/encuestas/encuesta';

// POST /api/v1/tickets/:id/encuesta (SPEC 39). Cualquier otro campo responde VALIDACION. El comentario se recorta
// antes de medirlo: 1000 caracteres útiles con espacios alrededor siguen siendo válidos.
export const calificacionSchema = z
  .object({
    calificacion: z.number().int().min(CALIFICACION_MIN).max(CALIFICACION_MAX),
    comentario: z
      .string()
      .refine((valor) => [...valor.trim()].length <= COMENTARIO_MAX, { error: `admite hasta ${COMENTARIO_MAX} caracteres` })
      .optional(),
  })
  .strict();
