import { z } from 'zod';
import { CANALES } from '../../domain/ticket/canal';

// strict(): lat, lng, prioridad, estado y cualquier otro campo responden VALIDACION.
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
  })
  .strict();
