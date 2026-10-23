import { z } from 'zod';

// strict(): rol, activo o cualquier otro campo responden VALIDACION.
// Nombre, DPI, correo, teléfono y contraseña los valida el dominio con sus códigos (NOMBRE_INVALIDO, DPI_INVALIDO,
// EMAIL_INVALIDO, TELEFONO_INVALIDO, POLITICA_PASSWORD); aquí solo los tipos y un tope contra cuerpos enormes.
export const registroSchema = z
  .object({
    nombre: z.string().max(1000),
    dpi: z.string().max(100),
    email: z.string().max(320),
    telefono: z.string().max(100).optional(),
    password: z.string().max(1000),
  })
  .strict()
  .transform((datos) => ({ ...datos, telefono: datos.telefono ?? null }));

export const verificarSchema = z
  .object({
    token: z.string().min(1).max(200),
  })
  .strict();
