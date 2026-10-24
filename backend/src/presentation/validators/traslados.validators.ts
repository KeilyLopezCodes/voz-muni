import { z } from 'zod';
import { ESTADOS_SOLICITUD } from '../../domain/traslado/solicitud-traslado';

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// strict(): cualquier otro campo responde VALIDACION. El motivo en blanco lo valida el dominio (MOTIVO_REQUERIDO);
// aquí solo el tipo y un tope contra cuerpos enormes.
export const solicitudTrasladoSchema = z
  .object({
    motivo: z.string().max(2000),
    dependenciaSugeridaId: z.number().int().positive().optional(),
  })
  .strict();

export const rechazoTrasladoSchema = z
  .object({
    motivo: z.string().max(2000),
  })
  .strict();

export const bandejaTrasladosSchema = z
  .object({
    estado: z.enum(ESTADOS_SOLICITUD).default('pendiente'),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
