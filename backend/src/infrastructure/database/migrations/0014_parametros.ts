import type { Knex } from 'knex';

// Parámetros municipales que configura el administrador (SPEC 15). Cada clave tiene su validador en el dominio.
// No se carga ningún valor: sin `limites_municipio` no se aceptan coordenadas.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE parametros (
      clave text PRIMARY KEY CHECK (clave ~ '^[a-z][a-z0-9_]{0,49}$'),
      valor jsonb NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  // RF-10: la ubicación va completa o no va.
  await knex.raw(`
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_ubicacion_completa CHECK ((lat IS NULL) = (lng IS NULL))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tickets DROP CONSTRAINT tickets_ubicacion_completa');
  await knex.raw('DROP TABLE parametros');
}
