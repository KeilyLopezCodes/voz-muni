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

// Alta en ventanilla. strict(): rol, password, activo o cualquier otro campo responden VALIDACION.
// Nombre, DPI, teléfono y correo los valida el dominio (NOMBRE_INVALIDO, DPI_INVALIDO, TELEFONO_INVALIDO, EMAIL_INVALIDO).
export const altaVecinoSchema = z
  .object({
    nombre: z.string().max(1000),
    dpi: z.string().max(100),
    email: z.string().max(320).optional(),
    telefono: z.string().max(100).optional(),
  })
  .strict()
  .transform((datos) => ({ ...datos, email: datos.email ?? null, telefono: datos.telefono ?? null }));
