import { z } from 'zod';
import 'dotenv/config';

export interface DatabaseEnv {
  DATABASE_URL: string;
}

export interface Env extends DatabaseEnv {
  PORT: number;
  JWT_SECRET: string;
  NODE_ENV: 'development' | 'test' | 'production';
  LOGIN_LIMITE_POR_VENTANA: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  MAIL_FROM: string;
  APP_URL: string;
  RECUPERACION_LIMITE_POR_VENTANA: number;
  ADJUNTOS_DIR: string;
}

const OBLIGATORIA = { error: 'es obligatoria' };

// `Nombre <correo>` o solo el correo.
function esRemitente(valor: string): boolean {
  const conNombre = /^[^<>]+<([^<>]+)>$/.exec(valor.trim());
  return z.email().safeParse(conNombre ? conNombre[1] : valor.trim()).success;
}

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres$/, error: 'debe ser una URL postgres://' }),
});

const envSchema = databaseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string(OBLIGATORIA).min(32, { error: 'debe tener al menos 32 caracteres' }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOGIN_LIMITE_POR_VENTANA: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string(OBLIGATORIA).min(1, OBLIGATORIA),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  // false = STARTTLS en el puerto 587; true = TLS directo, normalmente en el 465.
  SMTP_SECURE: z
    .enum(['true', 'false'], { error: 'debe ser true o false' })
    .default('false')
    .transform((valor) => valor === 'true'),
  SMTP_USER: z.string(OBLIGATORIA).min(1, OBLIGATORIA),
  SMTP_PASS: z.string(OBLIGATORIA).min(1, OBLIGATORIA),
  MAIL_FROM: z.string(OBLIGATORIA).refine(esRemitente, { error: 'debe tener la forma Nombre <correo> o ser un correo' }),
  APP_URL: z
    .url({ protocol: /^https?$/, error: 'debe ser una URL http:// o https://' })
    .refine((url) => !url.endsWith('/'), { error: 'no debe terminar en /' }),
  RECUPERACION_LIMITE_POR_VENTANA: z.coerce.number().int().positive().default(5),
  // Carpeta de los adjuntos (SPEC 24). El backend la crea al arrancar si no existe.
  ADJUNTOS_DIR: z.string(OBLIGATORIA).min(1, OBLIGATORIA),
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
