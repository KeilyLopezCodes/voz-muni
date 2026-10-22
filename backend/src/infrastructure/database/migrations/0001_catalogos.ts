import type { Knex } from 'knex';

// Catálogos administrables (sección 6). Los valores municipales son datos, no código.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE roles (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL UNIQUE,
      permisos jsonb NOT NULL DEFAULT '{}'
    )
  `);

  // La FK de coordinador_id se agrega en 0002_usuarios: usuarios todavía no existe.
  await knex.raw(`
    CREATE TABLE dependencias (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL UNIQUE,
      coordinador_id bigint NULL,
      activa boolean NOT NULL DEFAULT true
    )
  `);

  await knex.raw(`
    CREATE TABLE categorias (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL UNIQUE,
      dependencia_id bigint NOT NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
      campos_extra jsonb NOT NULL DEFAULT '[]',
      activa boolean NOT NULL DEFAULT true
    )
  `);

  await knex.raw(`
    CREATE TABLE politicas_sla (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      categoria_id bigint NOT NULL REFERENCES categorias (id) ON DELETE RESTRICT,
      prioridad text NOT NULL CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
      horas_respuesta integer NOT NULL CHECK (horas_respuesta > 0),
      horas_resolucion integer NOT NULL CHECK (horas_resolucion > 0),
      UNIQUE (categoria_id, prioridad)
    )
  `);

  await knex.raw(`
    CREATE TABLE zonas (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      tipo text NOT NULL CHECK (tipo IN ('zona', 'colonia', 'aldea')),
      UNIQUE (nombre, tipo)
    )
  `);

  await knex.raw(`
    CREATE TABLE calendario_laboral (
      fecha date PRIMARY KEY,
      es_habil boolean NOT NULL,
      descripcion text NULL
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE calendario_laboral');
  await knex.raw('DROP TABLE zonas');
  await knex.raw('DROP TABLE politicas_sla');
  await knex.raw('DROP TABLE categorias');
  await knex.raw('DROP TABLE dependencias');
  await knex.raw('DROP TABLE roles');
}
