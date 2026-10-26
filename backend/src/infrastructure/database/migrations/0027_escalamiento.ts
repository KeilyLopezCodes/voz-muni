import type { Knex } from 'knex';

// Escalamiento al vencer el SLA (RF-29, SPEC 32): cuándo y por qué plazo se escaló cada queja. "Escalada" sigue
// siendo una marca, no un estado (sección 3). Las quejas existentes tienen escalado = false y cumplen el CHECK.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN escalado_en timestamptz NULL,
      ADD COLUMN escalado_por text NULL CONSTRAINT tickets_escalado_por_check CHECK (escalado_por IN ('respuesta', 'resolucion')),
      ADD CONSTRAINT tickets_escalado_consistente
        CHECK (escalado = (escalado_en IS NOT NULL) AND (escalado_en IS NULL) = (escalado_por IS NULL))
  `);
  // Reclamo del job: las quejas sin escalar con un plazo que puede vencer.
  await knex.raw(`
    CREATE INDEX tickets_escalar_respuesta_idx
      ON tickets (vence_respuesta) WHERE NOT escalado AND primera_respuesta_en IS NULL
  `);
  await knex.raw('CREATE INDEX tickets_escalar_resolucion_idx ON tickets (vence_resolucion) WHERE NOT escalado');
  // Bandeja /escaladas.
  await knex.raw('CREATE INDEX tickets_escaladas_idx ON tickets (escalado_en) WHERE escalado');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX tickets_escaladas_idx');
  await knex.raw('DROP INDEX tickets_escalar_resolucion_idx');
  await knex.raw('DROP INDEX tickets_escalar_respuesta_idx');
  await knex.raw(`
    ALTER TABLE tickets
      DROP CONSTRAINT tickets_escalado_consistente,
      DROP COLUMN escalado_por,
      DROP COLUMN escalado_en
  `);
}
