import { z } from 'zod';

// El rol, el DPI y la dependencia los valida el servicio, que responde ROL_NO_PERMITIDO, DPI_INVALIDO y los de dependencia.
const nombre = z.string().trim().min(1).max(150);
const telefono = z.string().min(8).max(20);
const dependenciaId = z.number().int().positive();

export const idUsuarioSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const filtroUsuariosSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
  rol: z.string().min(1).optional(),
  dependenciaId: z.coerce.number().int().positive().optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  busqueda: z.string().min(1).max(100).optional(),
});

export const altaUsuarioSchema = z.object({
  nombre,
  email: z.email().transform((email) => email.toLowerCase()),
  dpi: z.string(),
  telefono: telefono.optional(),
  rol: z.string(),
  dependenciaId: dependenciaId.nullable().optional(),
});

// strict(): email, dpi y activo no se editan aquí y responden VALIDACION.
export const edicionUsuarioSchema = z
  .object({
    nombre: nombre.optional(),
    telefono: telefono.nullable().optional(),
    rol: z.string().optional(),
    dependenciaId: dependenciaId.nullable().optional(),
  })
  .strict()
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), {
    error: 'Hay que enviar al menos un campo',
  });
