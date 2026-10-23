import { z } from 'zod';

export const idCategoriaSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// La forma de cada campo la valida el dominio (DEFINICION_INVALIDA con detalles). Aquí solo el sobre.
export const camposExtraSchema = z
  .object({
    campos: z.unknown(),
  })
  .strict();
