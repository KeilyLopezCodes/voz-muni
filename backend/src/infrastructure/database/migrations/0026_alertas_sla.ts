import type { Knex } from 'knex';

// Alerta al umbral del plazo (RF-28, RF-32, SPEC 31): el instante precalculado de cada alerta y su marca de enviada,
// los datos de cada notificación y el umbral municipal. Los índices parciales sirven al job, que solo busca las
// alertas pendientes.
// El valor va literal: una migración aplicada no cambia de comportamiento si cambia el código.
const UMBRAL = { clave: 'sla_umbral_alerta', valor: 80 };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN alerta_respuesta_en timestamptz NULL,
      ADD COLUMN alerta_resolucion_en timestamptz NULL,
      ADD COLUMN alerta_respuesta_enviada_en timestamptz NULL,
      ADD COLUMN alerta_resolucion_enviada_en timestamptz NULL
  `);
  await knex.raw(`
    CREATE INDEX tickets_alerta_respuesta_pendiente_idx
      ON tickets (alerta_respuesta_en) WHERE alerta_respuesta_enviada_en IS NULL
  `);
  await knex.raw(`
    CREATE INDEX tickets_alerta_resolucion_pendiente_idx
      ON tickets (alerta_resolucion_en) WHERE alerta_resolucion_enviada_en IS NULL
  `);
  // El texto de cada notificación lo arma el frontend con tipo y datos: la base no guarda frases.
  await knex.raw(`ALTER TABLE notificaciones ADD COLUMN datos jsonb NOT NULL DEFAULT '{}'`);
  await knex.raw('CREATE INDEX notificaciones_usuario_creado_idx ON notificaciones (usuario_id, creado_en)');
  await knex.raw('INSERT INTO parametros (clave, valor) VALUES (?, ?::jsonb) ON CONFLICT (clave) DO NOTHING', [
    UMBRAL.clave,
    JSON.stringify(UMBRAL.valor),
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros').where({ clave: UMBRAL.clave }).delete();
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
