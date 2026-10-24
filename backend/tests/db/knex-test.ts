import path from 'node:path';
import knex, { type Knex } from 'knex';
import type { Env } from '../../src/infrastructure/config/env';
import { buildKnexConfig } from '../../src/infrastructure/database/knex-config';

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error('DATABASE_URL_TEST no está definida; copia .env.example a .env');
}

// Migraciones y seeds compilados: se prueba el mismo artefacto que corre en producción.
const distDatabaseDir = path.resolve(__dirname, '../../dist/infrastructure/database');

// Configuración completa de la app contra la base de pruebas. El correo nunca sale: las suites inyectan un enviador falso.
export function envDePrueba(cambios: Partial<Env> = {}): Env {
  return {
    PORT: 0,
    DATABASE_URL: databaseUrlTest!,
    JWT_SECRET: 'secreto-de-pruebas-de-al-menos-32-caracteres',
    NODE_ENV: 'test',
    LOGIN_LIMITE_POR_VENTANA: 1000,
    SMTP_HOST: 'smtp.invalid',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'pruebas',
    SMTP_PASS: 'pruebas',
    MAIL_FROM: 'VozMuni <no-responder@vozmuni.test>',
    APP_URL: 'http://localhost:5173',
    RECUPERACION_LIMITE_POR_VENTANA: 1000,
    ...cambios,
  };
}

// Deja la base sin esquema. Antes borra sesiones y usuarios, porque el down de 0006_roles
// falla a propósito si algún usuario tiene uno de los 6 roles (ON DELETE RESTRICT).
export async function reiniciarEsquema(db: Knex): Promise<void> {
  // ticket_asignaciones es solo de inserción y apunta a tickets y usuarios: revertir su migración borra la tabla
  // (el trigger no impide DROP TABLE), y así los tickets y usuarios se pueden borrar.
  if (await db.schema.hasTable('ticket_asignaciones')) {
    await db.migrate.down({ name: '0017_asignaciones.js' });
  }
  // Primero las tablas que apuntan a usuarios. La bitácora no se puede vaciar: el rollback la elimina.
  const tablas = [
    'ticket_historial',
    'comentarios',
    'adjuntos',
    'encuestas',
    'notificaciones',
    'tickets',
    'sesiones',
    'restablecimientos',
    'usuarios',
  ];
  for (const tabla of tablas) {
    if (await db.schema.hasTable(tabla)) {
      await db(tabla).delete();
    }
  }
  await db.migrate.rollback(undefined, true);
}

export function createTestKnex(): Knex {
  const config = buildKnexConfig(databaseUrlTest!);
  return knex({
    ...config,
    migrations: { ...config.migrations, directory: path.join(distDatabaseDir, 'migrations') },
    seeds: { ...config.seeds, directory: path.join(distDatabaseDir, 'seeds') },
  });
}
