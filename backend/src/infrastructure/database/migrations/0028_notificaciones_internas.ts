import type { Knex } from 'knex';

// Notificaciones internas (RF-32, SPEC 36): cuándo se leyó cada una, agrupación de comentarios y retención.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE notificaciones ADD COLUMN leida_en timestamptz NULL');
  await knex.raw('UPDATE notificaciones SET leida_en = creado_en WHERE leida');
  await knex.raw(
    'ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_leida_consistente CHECK (leida = (leida_en IS NOT NULL))',
  );
  // Una sola notificación de comentarios sin leer por usuario y queja.
  await knex.raw(
    `CREATE UNIQUE INDEX notificaciones_comentario_sin_leer_uq ON notificaciones (usuario_id, ticket_id)
     WHERE tipo = 'comentario_nuevo' AND NOT leida`,
  );
  await knex.raw('CREATE INDEX notificaciones_leidas_idx ON notificaciones (leida_en) WHERE leida');
  await knex('parametros')
    .insert({ clave: 'notificaciones_retencion_dias', valor: JSON.stringify(30) })
    .onConflict('clave')
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros').where({ clave: 'notificaciones_retencion_dias' }).delete();
  await knex.raw('DROP INDEX notificaciones_leidas_idx');
  await knex.raw('DROP INDEX notificaciones_comentario_sin_leer_uq');
  await knex.raw('ALTER TABLE notificaciones DROP CONSTRAINT notificaciones_leida_consistente');
  await knex.raw('ALTER TABLE notificaciones DROP COLUMN leida_en');
}
