import { z } from 'zod';
import { PRIORIDADES } from '../../domain/ticket/prioridad';
import { BUSQUEDA_MAX, BUSQUEDA_MIN } from '../../domain/ticket/busqueda';
import { CANALES } from '../../domain/ticket/canal';
import { ESTADOS_TICKET } from '../../domain/ticket/estado-ticket';

// strict(): prioridad, estado y cualquier otro campo responden VALIDACION.
// lat y lng deben ser números JSON (un string responde VALIDACION); sus reglas las aplica el dominio (SPEC 15).
// datosExtra lo valida el dominio contra los campos de la categoría (DATOS_EXTRA_INVALIDOS, SPEC 14).
// Los rangos de título, descripción y dirección los valida el dominio (TITULO_INVALIDO, …); aquí solo
// se pone un tope contra cuerpos enormes. Quién envía solicitanteId y canal lo decide el servicio según el alcance.
export const registroTicketSchema = z
  .object({
    categoriaId: z.number().int().positive(),
    zonaId: z.number().int().positive(),
    titulo: z.string().max(1000),
    descripcion: z.string().max(20000),
    direccion: z.string().max(1000),
    solicitanteId: z.number().int().positive().optional(),
    canal: z.enum(CANALES).optional(),
    datosExtra: z.unknown().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .strict();

// `estado` repetible (?estado=a&estado=b): uno o varios de los 8 estados, sin repetir (SPEC 38).
const estadosSchema = z
  .union([z.enum(ESTADOS_TICKET), z.array(z.enum(ESTADOS_TICKET)).max(ESTADOS_TICKET.length)])
  .transform((valor) => (Array.isArray(valor) ? valor : [valor]))
  .refine((estados) => new Set(estados).size === estados.length, { error: 'un estado repetido' });

// `q` recortado, de 2 a 100 caracteres (SPEC 38).
const busquedaSchema = z
  .string()
  .transform((valor) => valor.trim())
  .refine((valor) => [...valor].length >= BUSQUEDA_MIN && [...valor].length <= BUSQUEDA_MAX, {
    error: `debe tener de ${BUSQUEDA_MIN} a ${BUSQUEDA_MAX} caracteres`,
  });

// Filtros del listado interno (SPEC 45), comunes al listado y al resumen. El rango (formato, orden y 366 días) lo
// valida el dominio con rangoReportes: RANGO_INVALIDO. `escalado` solo admite `true`.
const id = z.coerce.number().int().positive();
const filtrosComunes = {
  q: busquedaSchema.optional(),
  dependenciaId: id.optional(),
  categoriaId: id.optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  desde: z.string().max(10).optional(),
  hasta: z.string().max(10).optional(),
  escalado: z
    .literal('true')
    .transform(() => true as const)
    .optional(),
};

// Query de GET /api/v1/tickets (SPEC 25, 38 y 45). Cualquier otro parámetro responde VALIDACION.
export const listadoTicketsSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
    estado: estadosSchema.optional(),
    ...filtrosComunes,
  })
  .strict();

// Query de GET /api/v1/tickets/resumen (SPEC 38 y 45): los mismos filtros, salvo `estado`.
export const resumenTicketsSchema = z.object(filtrosComunes).strict();

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});
