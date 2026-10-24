import type { Knex } from 'knex';

// Línea de tiempo (RF-25, SPEC 28): cada rama del UNION ALL usa un índice (ticket_id, creado_en).
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX solicitudes_traslado_ticket_creado_idx ON solicitudes_traslado (ticket_id, creado_en)');
  await knex.raw('CREATE INDEX adjuntos_ticket_creado_idx ON adjuntos (ticket_id, creado_en)');
  await knex.raw('DROP INDEX adjuntos_ticket_idx');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX adjuntos_ticket_idx ON adjuntos (ticket_id)');
  await knex.raw('DROP INDEX adjuntos_ticket_creado_idx');
  await knex.raw('DROP INDEX solicitudes_traslado_ticket_creado_idx');
}
