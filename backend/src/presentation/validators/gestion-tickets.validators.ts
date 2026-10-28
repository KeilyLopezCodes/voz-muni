import { z } from 'zod';
import { PRIORIDADES } from '../../domain/ticket/prioridad';
import { busquedaSchema, estadosSchema } from './tickets.validators';

const id = z.coerce.number().int().positive();

// Query de GET /api/v1/tickets/gestion (SPEC 45). Cualquier otro parámetro responde VALIDACION. El formato y el orden
// de desde/hasta los valida el dominio (RANGO_INVALIDO).
export const gestionTicketsSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
    estado: estadosSchema.optional(),
    q: busquedaSchema.optional(),
    dependenciaId: id.optional(),
    categoriaId: id.optional(),
    prioridad: z.enum(PRIORIDADES).optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    tecnico: z.union([z.literal('sin_asignar'), id]).optional(),
  })
  .strict();

// GET /api/v1/tickets/gestion/opciones no admite parámetros.
export const opcionesGestionSchema = z.object({}).strict();
