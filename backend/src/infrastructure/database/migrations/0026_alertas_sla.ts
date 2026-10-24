import type { Knex } from 'knex';

// Alerta al 80 % del plazo (RF-28, SPEC 31): instantes precalculados por SlaService, marcas de enviada y los datos
// de cada notificación. El texto de la notificación lo arma el frontend con los archivos de traducción.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN alerta_respuesta_en timestamptz NULL,
      ADD COLUMN alerta_resolucion_en timestamptz NULL,
      ADD COLUMN alerta_respuesta_enviada_en timestamptz NULL,
      ADD COLUMN alerta_resolucion_enviada_en timestamptz NULL
  `);
  await knex.raw(
    'CREATE INDEX tickets_alerta_respuesta_pendiente_idx ON tickets (alerta_respuesta_en) WHERE alerta_respuesta_enviada_en IS NULL',
  );
  await knex.raw(
    'CREATE INDEX tickets_alerta_resolucion_pendiente_idx ON tickets (alerta_resolucion_en) WHERE alerta_resolucion_enviada_en IS NULL',
  );
  await knex.raw(`ALTER TABLE notificaciones ADD COLUMN datos jsonb NOT NULL DEFAULT '{}'`);
  await knex.raw('CREATE INDEX notificaciones_usuario_creado_idx ON notificaciones (usuario_id, creado_en)');
  await knex('parametros').insert({ clave: 'sla_umbral_alerta', valor: JSON.stringify(80) }).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros').where({ clave: 'sla_umbral_alerta' }).delete();
  await knex.raw('DROP INDEX notificaciones_usuario_creado_idx');
  await knex.raw('ALTER TABLE notificaciones DROP COLUMN datos');
  await knex.raw('DROP INDEX tickets_alerta_resolucion_pendiente_idx');
  await knex.raw('DROP INDEX tickets_alerta_respuesta_pendiente_idx');
  await knex.raw(`
    ALTER TABLE tickets
      DROP COLUMN alerta_resolucion_enviada_en,
      DROP COLUMN alerta_respuesta_enviada_en,
      DROP COLUMN alerta_resolucion_en,
      DROP COLUMN alerta_respuesta_en
  `);
}
