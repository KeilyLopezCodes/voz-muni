import { z } from 'zod';

export const idNotificacionSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Solo se puede marcar como leída: { leida: false } o cualquier otro campo responden VALIDACION.
export const marcarNotificacionSchema = z
  .object({
    leida: z.literal(true),
  })
  .strict();
