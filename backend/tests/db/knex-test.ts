import os from 'node:os';
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
    CONSULTA_LIMITE_POR_VENTANA: 1000,
    // Los adjuntos de las pruebas van a una carpeta temporal, nunca a la del proyecto.
    ADJUNTOS_DIR: path.join(os.tmpdir(), 'vozmuni-adjuntos-pruebas'),
    // El job de SLA nunca corre en las pruebas: se llama a cada servicio directamente (SPEC 31 y 32).
    SLA_JOB_ACTIVO: false,
    SLA_JOB_CRON: '*/5 * * * *',
    // Ni el de correos: el primer envío es sincrónico y los reintentos se prueban llamando a procesar (SPEC 34).
    CORREOS_JOB_ACTIVO: false,
    CORREOS_JOB_CRON: '* * * * *',
    NOTIFICACIONES_PURGA_CRON: '0 3 * * *',
    ...cambios,
  };
}

// Solo para las pruebas: la bitácora es de solo inserción (SPEC 03) y sus filas apuntan a usuarios y dependencias
// con ON DELETE RESTRICT (SPEC 41). Para limpiar entre pruebas se desactivan sus triggers el tiempo justo de vaciarla.
// La aplicación nunca hace esto.
export async function vaciarBitacora(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('bitacora'))) {
    return;
  }
  await db.transaction(async (trx) => {
    await trx.raw('ALTER TABLE bitacora DISABLE TRIGGER USER');
    await trx('bitacora').delete();
    await trx.raw('ALTER TABLE bitacora ENABLE TRIGGER USER');
  });
}

// Deja la base sin esquema. Antes borra sesiones y usuarios, porque el down de 0006_roles
// falla a propósito si algún usuario tiene uno de los 6 roles (ON DELETE RESTRICT).
export async function reiniciarEsquema(db: Knex): Promise<void> {
  // ticket_asignaciones es solo de inserción y apunta a tickets y usuarios: revertir su migración borra la tabla
  // (el trigger no impide DROP TABLE), y así los tickets y usuarios se pueden borrar.
  if (await db.schema.hasTable('ticket_asignaciones')) {
    await db.migrate.down({ name: '0017_asignaciones.js' });
  }
  // Primero las tablas que apuntan a usuarios. La bitácora se vacía con sus triggers desactivados (SPEC 41).
  await vaciarBitacora(db);
  const tablas = [
    'correos_salientes', // apunta a tickets y usuarios (SPEC 34)
    'solicitudes_traslado',
    'ticket_historial',
    'comentarios',
    'adjuntos',
    'encuestas',
    'notificaciones',
    'tickets',
    'politicas_sla', // actualizado_por apunta a usuarios (SPEC 29)
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
