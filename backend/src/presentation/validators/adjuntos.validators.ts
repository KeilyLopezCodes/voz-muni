import { z } from 'zod';

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const idAdjuntoSchema = z.object({
  id: z.coerce.number().int().positive(),
  adjuntoId: z.coerce.number().int().positive(),
});

// Los campos de texto del multipart. strict(): cualquier otro responde VALIDACION. Sin `interno`, el servicio usa
// false; que un adjunto del registro no puede ser interno lo decide el dominio.
export const camposSubidaSchema = z
  .object({
    interno: z
      .enum(['true', 'false'])
      .transform((valor) => valor === 'true')
      .optional(),
  })
  .strict();
