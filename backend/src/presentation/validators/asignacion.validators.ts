import { z } from 'zod';
import { VISTAS_POR_ASIGNAR } from '../../domain/repositories/por-asignar-lectura-repository';

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// strict(): cualquier otro campo responde VALIDACION. El motivo en blanco al reasignar lo valida el dominio
// (MOTIVO_REQUERIDO); aquí solo el tipo y el largo.
export const asignacionSchema = z
  .object({
    tecnicoId: z.number().int().positive(),
    motivo: z.string().min(1).max(1000).optional(),
  })
  .strict();

export const porAsignarSchema = z
  .object({
    vista: z.enum(VISTAS_POR_ASIGNAR).default('sin_tecnico'),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
