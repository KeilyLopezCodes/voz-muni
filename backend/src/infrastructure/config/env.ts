import { z } from 'zod';

export interface Env {
  PORT: number;
  DATABASE_URL: string;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres$/, error: 'debe ser una URL postgres://' }),
});

// Falla al arrancar si la configuración es inválida, en vez de en la primera consulta.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return result.data;
}
