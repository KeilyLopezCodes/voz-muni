import type { Knex } from 'knex';

// Resolución vigente de la queja (RF-23, SPEC 26): la descripción y quién resolvió. El historial conserva cada
// resolución anterior. Sin CHECK que exija la resolución en resuelta o cerrada: la regla la garantiza el dominio,
// y un CHECK haría fallar el relleno si hubiera filas antiguas sin descripción en el historial.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN resolucion text NULL,
      ADD COLUMN resuelto_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT
  `);

  // Relleno de las quejas ya resueltas o cerradas con su última entrada a resuelta.
  await knex.raw(`
    UPDATE tickets t
       SET resolucion = h.motivo,
           resuelto_por = h.usuario_id
      FROM (
        SELECT DISTINCT ON (ticket_id) ticket_id, motivo, usuario_id
          FROM ticket_historial
         WHERE estado_nuevo = 'resuelta'
         ORDER BY ticket_id, creado_en DESC, id DESC
      ) h
     WHERE h.ticket_id = t.id
       AND t.estado IN ('resuelta', 'cerrada')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      DROP COLUMN resuelto_por,
      DROP COLUMN resolucion
  `);
}
