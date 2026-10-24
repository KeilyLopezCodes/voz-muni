import { z } from 'zod';

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const idComentarioSchema = z.object({
  id: z.coerce.number().int().positive(),
  comentarioId: z.coerce.number().int().positive(),
});

// strict(): cualquier otro campo responde VALIDACION. El largo y el texto en blanco los valida el dominio
// (CUERPO_INVALIDO); aquí solo el tipo y un tope contra cuerpos enormes.
export const comentarioSchema = z
  .object({
    cuerpo: z.string().max(20000),
    interno: z.boolean().default(false),
  })
  .strict();

// `interno` no se puede cambiar al editar: en el cuerpo responde VALIDACION.
export const edicionComentarioSchema = z
  .object({
    cuerpo: z.string().max(20000),
  })
  .strict();
