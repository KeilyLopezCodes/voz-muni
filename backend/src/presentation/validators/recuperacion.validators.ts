import { z } from 'zod';

// El correo se compara en minúsculas.
export const recuperarSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
});

// La política de la contraseña (RNF-08) la aplica el servicio, que responde POLITICA_PASSWORD.
export const restablecerSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string(),
});
