import { z } from 'zod';
import type { ComandoTransicion } from '../../application/dto/triage.dto';
import type { Prioridad } from '../../domain/ticket/prioridad';

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Unión discriminada por `accion`, cada rama strict(): una acción desconocida, un campo faltante o uno de más
// responden VALIDACION. La prioridad y el motivo vacío los valida el dominio (PRIORIDAD_INVALIDA, MOTIVO_REQUERIDO);
// aquí solo el tipo y un tope. Las specs de RF-18 agregarán ramas.
export const transicionSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('tomar') }).strict(),
  z
    .object({
      accion: z.literal('aceptar'),
      prioridad: z
        .string()
        .max(50)
        .transform((prioridad) => prioridad as Prioridad),
      categoriaId: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ accion: z.literal('rechazar'), motivo: z.string().max(1000) }).strict(),
]) satisfies z.ZodType<ComandoTransicion>;
