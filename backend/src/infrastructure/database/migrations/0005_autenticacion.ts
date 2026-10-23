import type { Knex } from 'knex';

// Bloqueo por intentos fallidos y tokens de renovación (RNF-09, SPEC 08).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE usuarios
      ADD COLUMN intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
      ADD COLUMN bloqueado_hasta timestamptz NULL
  `);

  // El token de renovación nunca se guarda en claro: token_hash es su SHA-256 en hexadecimal.
  await knex.raw(`
    CREATE TABLE sesiones (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      token_hash text NOT NULL UNIQUE,
      expira_en timestamptz NOT NULL,
      revocada_en timestamptz NULL,
      reemplazada_por bigint NULL REFERENCES sesiones (id) ON DELETE RESTRICT,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex.raw('CREATE INDEX sesiones_usuario_id_index ON sesiones (usuario_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE sesiones');
  await knex.raw(`
    ALTER TABLE usuarios
      DROP COLUMN bloqueado_hasta,
      DROP COLUMN intentos_fallidos
  `);
}
