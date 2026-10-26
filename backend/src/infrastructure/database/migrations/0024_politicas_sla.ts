import type { Knex } from 'knex';

// Administración de las políticas de SLA (RF-26, RF-41, SPEC 29): la última actualización de cada fila y la regla
// "respuesta ≤ resolución". La monotonía entre prioridades compara filas: la garantiza el dominio (validarMatriz).
// actualizado_por es NULL en las filas que no cargó el administrador, como las de seed:dev.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE politicas_sla
      ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN actualizado_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      ADD CONSTRAINT politicas_sla_respuesta_no_mayor CHECK (horas_respuesta <= horas_resolucion)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE politicas_sla
      DROP CONSTRAINT politicas_sla_respuesta_no_mayor,
      DROP COLUMN actualizado_por,
      DROP COLUMN actualizado_en
  `);
}
