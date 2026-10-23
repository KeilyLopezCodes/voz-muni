import type { Knex } from 'knex';

// Tokens de recuperación de contraseña (RF-03, SPEC 09). Vigente = sin usar, sin invalidar y con expira_en futuro.
export async function up(knex: Knex): Promise<void> {
  // El token nunca se guarda en claro: token_hash es su SHA-256 en hexadecimal.
  await knex.raw(`
    CREATE TABLE restablecimientos (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      token_hash text NOT NULL UNIQUE,
      expira_en timestamptz NOT NULL,
      usado_en timestamptz NULL,
      invalidado_en timestamptz NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex.raw('CREATE INDEX restablecimientos_usuario_id_index ON restablecimientos (usuario_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE restablecimientos');
}
