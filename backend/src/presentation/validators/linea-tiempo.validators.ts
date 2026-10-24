import { z } from 'zod';

export const lineaTiempoSchema = z
  .object({
    cursor: z.string().min(1).max(500).optional(),
    tamano: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
