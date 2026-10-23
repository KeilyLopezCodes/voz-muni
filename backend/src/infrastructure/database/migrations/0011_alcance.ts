import type { Knex } from 'knex';

// Columnas e índices para filtrar por alcance (RF-05, SPEC 11). Las llenan las specs de registro (RF-06, RF-07) y de bitácora (RF-42).
export async function up(knex: Knex): Promise<void> {
  // Alcance `registradas` del receptor. NULL en los tickets anteriores.
  await knex.raw('ALTER TABLE tickets ADD COLUMN registrado_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT');
  // Bitácora por dependencia del coordinador. ADD COLUMN no choca con los triggers, que solo bloquean filas.
  await knex.raw(
    'ALTER TABLE bitacora ADD COLUMN dependencia_id bigint NULL REFERENCES dependencias (id) ON DELETE RESTRICT',
  );

  await knex.raw('CREATE INDEX tickets_solicitante_idx ON tickets (solicitante_id)');
  await knex.raw('CREATE INDEX tickets_registrado_por_idx ON tickets (registrado_por)');
  await knex.raw('CREATE INDEX bitacora_dependencia_creado_en_idx ON bitacora (dependencia_id, creado_en)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX bitacora_dependencia_creado_en_idx');
  await knex.raw('DROP INDEX tickets_registrado_por_idx');
  await knex.raw('DROP INDEX tickets_solicitante_idx');
  await knex.raw('ALTER TABLE bitacora DROP COLUMN dependencia_id');
  await knex.raw('ALTER TABLE tickets DROP COLUMN registrado_por');
}
