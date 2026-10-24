import type { Knex } from 'knex';

// Adjuntos del registro y evidencias de la atención (RF-06, RF-20, SPEC 24).
// subido_por y origen no tienen valor por defecto: la migración falla si ya hay adjuntos, y ningún código los
// creaba antes de esta spec.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE adjuntos
      ADD COLUMN subido_por bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      ADD COLUMN creado_en timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN interno boolean NOT NULL DEFAULT false,
      ADD COLUMN origen text NOT NULL,
      ADD CONSTRAINT adjuntos_origen_check CHECK (origen IN ('registro', 'atencion')),
      ADD CONSTRAINT adjuntos_registro_publico CHECK (NOT (origen = 'registro' AND interno)),
      ADD CONSTRAINT adjuntos_tamano_maximo CHECK (tamano_bytes <= 10485760),
      ADD CONSTRAINT adjuntos_nombre_largo CHECK (char_length(nombre) BETWEEN 1 AND 255),
      ADD CONSTRAINT adjuntos_ruta_unica UNIQUE (ruta)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE adjuntos
      DROP CONSTRAINT adjuntos_ruta_unica,
      DROP CONSTRAINT adjuntos_nombre_largo,
      DROP CONSTRAINT adjuntos_tamano_maximo,
      DROP CONSTRAINT adjuntos_registro_publico,
      DROP CONSTRAINT adjuntos_origen_check,
      DROP COLUMN origen,
      DROP COLUMN interno,
      DROP COLUMN creado_en,
      DROP COLUMN subido_por
  `);
}
