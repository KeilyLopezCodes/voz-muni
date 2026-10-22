import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // email, telefono y password_hash son opcionales: un vecino registrado en ventanilla (RF-07)
  // puede no tener correo ni cuenta, pero necesita al menos un medio de contacto.
  await knex.raw(`
    CREATE TABLE usuarios (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      email text NULL,
      telefono text NULL,
      dpi text NULL UNIQUE,
      password_hash text NULL,
      rol_id bigint NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
      dependencia_id bigint NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
      activo boolean NOT NULL DEFAULT true,
      CONSTRAINT usuarios_contacto_check CHECK (email IS NOT NULL OR telefono IS NOT NULL)
    )
  `);

  await knex.raw('CREATE UNIQUE INDEX usuarios_email_lower_unique ON usuarios (lower(email))');

  // dependencias y usuarios se referencian mutuamente; la FK se cierra aquí.
  await knex.raw(`
    ALTER TABLE dependencias
      ADD CONSTRAINT dependencias_coordinador_id_fkey
      FOREIGN KEY (coordinador_id) REFERENCES usuarios (id) ON DELETE RESTRICT
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE dependencias DROP CONSTRAINT dependencias_coordinador_id_fkey');
  await knex.raw('DROP TABLE usuarios');
}
