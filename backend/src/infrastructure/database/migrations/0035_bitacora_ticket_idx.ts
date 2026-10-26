import type { Knex } from 'knex';

// Bitácora (SPEC 42): el filtro por número de queja también trae los comentarios y adjuntos, que guardan su queja en
// detalle.datos.ticketId. Índice de expresión parcial para esa comparación.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE INDEX bitacora_ticket_datos_idx ON bitacora (((detalle -> 'datos' ->> 'ticketId'))) WHERE entidad IN ('comentario', 'adjunto')`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX bitacora_ticket_datos_idx');
}
