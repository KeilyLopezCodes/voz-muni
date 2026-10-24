import { z } from 'zod';
import { CANALES } from '../../domain/ticket/canal';

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

// Query de GET /api/v1/tickets (SPEC 25). Los filtros llegan con RF-36: por ahora cualquier otro parámetro
// responde VALIDACION.
export const listadoTicketsSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const idTicketSchema = z.object({
  id: z.coerce.number().int().positive(),
});
