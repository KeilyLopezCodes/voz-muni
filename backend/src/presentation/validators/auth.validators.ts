import { z } from 'zod';

// El correo se compara en minúsculas.
export const loginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});
