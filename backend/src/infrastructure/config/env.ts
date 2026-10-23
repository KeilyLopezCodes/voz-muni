import { z } from 'zod';

export interface DatabaseEnv {
  DATABASE_URL: string;
}

export interface Env extends DatabaseEnv {
  PORT: number;
  JWT_SECRET: string;
  NODE_ENV: 'development' | 'test' | 'production';
  LOGIN_LIMITE_POR_VENTANA: number;
}

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres$/, error: 'debe ser una URL postgres://' }),
});

const envSchema = databaseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string({ error: 'es obligatoria' }).min(32, { error: 'debe tener al menos 32 caracteres' }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOGIN_LIMITE_POR_VENTANA: z.coerce.number().int().positive().default(10),
});

function parse<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return result.data;
}

// Falla al arrancar si la configuración es inválida, en vez de en la primera consulta.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parse(envSchema, source);
}

// Solo la conexión: la CLI de Knex migra y siembra sin necesitar JWT_SECRET.
export function loadDatabaseEnv(source: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  return parse(databaseEnvSchema, source);
}
