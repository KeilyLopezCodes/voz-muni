import { z } from 'zod';
import { PRIORIDADES } from '../../domain/ticket/prioridad';

const id = z.coerce.number().int().positive();

// GET /api/v1/reportes/resumen (SPEC 43). El rango (formato, orden y 366 días) lo valida el dominio: RANGO_INVALIDO.
export const resumenReportesSchema = z
  .object({
    desde: z.string().optional(),
    hasta: z.string().optional(),
    dependenciaId: id.optional(),
    categoriaId: id.optional(),
    zonaId: id.optional(),
    prioridad: z.enum(PRIORIDADES).optional(),
  })
  .strict();
