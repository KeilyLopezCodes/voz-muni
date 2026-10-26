import type { Knex } from 'knex';

// Bandeja de salida de correos (RF-31, SPEC 34): cada correo se guarda ya renderizado en la transacción del caso de
// uso, y se reintenta hasta 3 veces. El cuerpo (que puede llevar tokens y datos personales) solo existe mientras el
// correo está pendiente; al terminar quedan los metadatos.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE correos_salientes (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plantilla_clave text NOT NULL,
      para text NOT NULL,
      asunto text NOT NULL,
      texto text NULL,
      html text NULL,
      ticket_id bigint NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      usuario_id bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      estado text NOT NULL DEFAULT 'pendiente'
        CONSTRAINT correos_salientes_estado_check CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'descartado')),
      intentos integer NOT NULL DEFAULT 0 CONSTRAINT correos_salientes_intentos_check CHECK (intentos BETWEEN 0 AND 3),
      proximo_intento_en timestamptz NOT NULL DEFAULT now(),
      expira_en timestamptz NULL,
      ultimo_error text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      terminado_en timestamptz NULL,
      CONSTRAINT correos_salientes_cuerpo_solo_pendiente
        CHECK ((estado = 'pendiente') = (texto IS NOT NULL AND html IS NOT NULL)),
      CONSTRAINT correos_salientes_terminado CHECK ((estado = 'pendiente') = (terminado_en IS NULL))
    )
  `);
  await knex.raw(
    `CREATE INDEX correos_salientes_pendientes_idx ON correos_salientes (proximo_intento_en) WHERE estado = 'pendiente'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE correos_salientes');
}
