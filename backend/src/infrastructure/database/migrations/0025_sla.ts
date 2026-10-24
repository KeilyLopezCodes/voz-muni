import type { Knex } from 'knex';

// Cálculo de vencimientos en horas hábiles (RF-26, RF-27, SPEC 30): seguimiento del plazo en tickets y la jornada
// laboral única. No hay relleno: las quejas aceptadas antes quedan con los vencimientos en NULL.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN primera_respuesta_en timestamptz NULL,
      ADD COLUMN sla_inicio_resolucion timestamptz NULL,
      ADD COLUMN sla_pausa_minutos integer NOT NULL DEFAULT 0 CHECK (sla_pausa_minutos >= 0),
      ADD COLUMN sla_pausado_desde timestamptz NULL,
      ADD COLUMN sla_restante_minutos integer NULL CHECK (sla_restante_minutos >= 0),
      ADD CONSTRAINT tickets_sla_pausa_completa CHECK ((sla_pausado_desde IS NULL) = (sla_restante_minutos IS NULL))
  `);
  await knex('parametros')
    .insert({ clave: 'jornada_laboral', valor: JSON.stringify({ inicio: '08:00', fin: '16:00' }) })
    .onConflict('clave')
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros').where({ clave: 'jornada_laboral' }).delete();
  await knex.raw(`
    ALTER TABLE tickets
      DROP CONSTRAINT tickets_sla_pausa_completa,
      DROP COLUMN sla_restante_minutos,
      DROP COLUMN sla_pausado_desde,
      DROP COLUMN sla_pausa_minutos,
      DROP COLUMN sla_inicio_resolucion,
      DROP COLUMN primera_respuesta_en
  `);
}
