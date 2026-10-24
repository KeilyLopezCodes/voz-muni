import { z } from 'zod';
import type { ComandoAtencion } from '../../application/dto/atencion.dto';
import type { ComandoTriage } from '../../application/dto/triage.dto';
import { ESTADOS_ABIERTOS } from '../../domain/repositories/asignacion-repository';
import type { Prioridad } from '../../domain/ticket/prioridad';

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Unión discriminada por `accion`, cada rama strict(): una acción desconocida, un campo faltante o uno de más
// responden VALIDACION. La prioridad y los textos en blanco los valida el dominio (PRIORIDAD_INVALIDA,
// MOTIVO_REQUERIDO, DESCRIPCION_REQUERIDA); aquí solo el tipo y el largo máximo.
// Triage (SPEC 19): tomar, aceptar y rechazar. Atención (SPEC 22): iniciar, poner_en_espera, reanudar y resolver.
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
  z.object({ accion: z.literal('iniciar') }).strict(),
  z.object({ accion: z.literal('poner_en_espera'), motivo: z.string().max(1000) }).strict(),
  z.object({ accion: z.literal('reanudar') }).strict(),
  z.object({ accion: z.literal('resolver'), descripcion: z.string().max(4000) }).strict(),
]) satisfies z.ZodType<ComandoTriage | ComandoAtencion>;

// Sin `estado`, o con `todas`, la bandeja trae los tres estados abiertos.
export const bandejaAtencionSchema = z
  .object({
    estado: z.enum([...ESTADOS_ABIERTOS, 'todas']).default('todas'),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .transform(({ estado, ...resto }) => ({ ...resto, estados: estado === 'todas' ? [...ESTADOS_ABIERTOS] : [estado] }));
