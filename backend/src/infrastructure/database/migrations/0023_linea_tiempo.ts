import type { Knex } from 'knex';

// Línea de tiempo de la queja (RF-25, SPEC 28): cada rama del UNION ALL lee su tabla por (ticket_id, creado_en),
// como ya lo hacen ticket_historial, ticket_asignaciones y comentarios. No hay tablas ni columnas nuevas.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX solicitudes_traslado_ticket_creado_idx ON solicitudes_traslado (ticket_id, creado_en)');
  // Reemplaza al de solo ticket_id (SPEC 03), como hizo 0019 con comentarios.
  await knex.raw('CREATE INDEX adjuntos_ticket_creado_idx ON adjuntos (ticket_id, creado_en)');
  await knex.raw('DROP INDEX adjuntos_ticket_idx');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX adjuntos_ticket_idx ON adjuntos (ticket_id)');
  await knex.raw('DROP INDEX adjuntos_ticket_creado_idx');
  await knex.raw('DROP INDEX solicitudes_traslado_ticket_creado_idx');
}
