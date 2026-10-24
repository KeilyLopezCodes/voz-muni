import type { Knex } from 'knex';

// Comentarios públicos y notas internas (RF-19, RF-22, SPEC 23): edición del autor y límites del dato.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE comentarios ADD COLUMN editado_en timestamptz NULL');
  // Límite del dato, como en SPEC 12; no es una regla configurable.
  await knex.raw(
    'ALTER TABLE comentarios ADD CONSTRAINT comentarios_cuerpo_largo CHECK (char_length(cuerpo) BETWEEN 1 AND 4000)',
  );
  // El hilo se lee en orden cronológico: este índice reemplaza al de solo ticket_id (SPEC 03).
  await knex.raw('CREATE INDEX comentarios_ticket_creado_idx ON comentarios (ticket_id, creado_en)');
  await knex.raw('DROP INDEX comentarios_ticket_idx');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX comentarios_ticket_idx ON comentarios (ticket_id)');
  await knex.raw('DROP INDEX comentarios_ticket_creado_idx');
  await knex.raw('ALTER TABLE comentarios DROP CONSTRAINT comentarios_cuerpo_largo');
  await knex.raw('ALTER TABLE comentarios DROP COLUMN editado_en');
}
