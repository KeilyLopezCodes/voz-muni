import type { Knex } from 'knex';

// Cálculo de vencimientos con calendario laboral (RF-27, SPEC 30): el seguimiento del SLA en tickets y la jornada
// laboral municipal. vence_respuesta y vence_resolucion existen desde SPEC 03. Sin relleno: las quejas aceptadas
// antes de esta migración quedan con los vencimientos en NULL.
// El valor va literal: una migración aplicada no cambia de comportamiento si cambia el código.
const JORNADA = { clave: 'jornada_laboral', valor: { inicio: '08:00', fin: '16:00' } };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN primera_respuesta_en timestamptz NULL,
      ADD COLUMN sla_inicio_resolucion timestamptz NULL,
      ADD COLUMN sla_pausa_minutos integer NOT NULL DEFAULT 0 CONSTRAINT tickets_sla_pausa_minutos_check CHECK (sla_pausa_minutos >= 0),
      ADD COLUMN sla_pausado_desde timestamptz NULL,
      ADD COLUMN sla_restante_minutos integer NULL CONSTRAINT tickets_sla_restante_minutos_check CHECK (sla_restante_minutos >= 0),
      ADD CONSTRAINT tickets_sla_pausa_completa CHECK ((sla_pausado_desde IS NULL) = (sla_restante_minutos IS NULL))
  `);
  await knex.raw('INSERT INTO parametros (clave, valor) VALUES (?, ?::jsonb) ON CONFLICT (clave) DO NOTHING', [
    JORNADA.clave,
    JSON.stringify(JORNADA.valor),
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros').where({ clave: JORNADA.clave }).delete();
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
