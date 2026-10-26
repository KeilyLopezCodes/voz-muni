import { z } from 'zod';

// Query de GET /api/v1/tickets/escaladas (SPEC 32). Cualquier otro parámetro responde VALIDACION.
export const escaladasSchema = z
  .object({
    dependenciaId: z.coerce.number().int().positive().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
