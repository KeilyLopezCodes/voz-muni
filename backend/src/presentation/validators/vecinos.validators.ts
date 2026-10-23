import { z } from 'zod';
import type { CriterioVecino } from '../../domain/repositories/vecino-repository';

// Exactamente uno de email, telefono o dpi. El DPI de 13 dígitos (con espacios) lo valida el servicio.
export const busquedaVecinoSchema = z
  .object({
    email: z.email().optional(),
    telefono: z.string().min(1).max(20).optional(),
    dpi: z.string().min(1).max(20).optional(),
  })
  .strict()
  .refine((query) => [query.email, query.telefono, query.dpi].filter((valor) => valor !== undefined).length === 1, {
    error: 'Hay que enviar exactamente uno de email, telefono o dpi',
  })
  .transform((query): CriterioVecino => {
    if (query.email !== undefined) return { email: query.email };
    if (query.telefono !== undefined) return { telefono: query.telefono };
    return { dpi: query.dpi! };
  });
