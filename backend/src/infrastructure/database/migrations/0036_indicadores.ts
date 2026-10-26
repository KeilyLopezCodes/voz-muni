import type { Knex } from 'knex';

// Indicadores del tablero (RF-39, SPEC 43): los minutos hábiles de la primera respuesta y del último ciclo de
// resolución, guardados por SlaService cuando ocurren. Sin relleno: las quejas anteriores quedan en NULL y no cuentan
// en los promedios. Los índices sirven al rango por fecha de registro del tablero.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN minutos_respuesta integer NULL CONSTRAINT tickets_minutos_respuesta_no_negativo CHECK (minutos_respuesta >= 0),
      ADD COLUMN minutos_resolucion integer NULL CONSTRAINT tickets_minutos_resolucion_no_negativo CHECK (minutos_resolucion >= 0)
  `);
  await knex.raw('CREATE INDEX tickets_creado_en_idx ON tickets (creado_en)');
  await knex.raw('CREATE INDEX tickets_categoria_creado_idx ON tickets (categoria_id, creado_en)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX tickets_categoria_creado_idx');
  await knex.raw('DROP INDEX tickets_creado_en_idx');
  await knex.raw('ALTER TABLE tickets DROP COLUMN minutos_resolucion, DROP COLUMN minutos_respuesta');
}
