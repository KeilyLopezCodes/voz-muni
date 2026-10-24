import type { Knex } from 'knex';

// Solicitudes de traslado entre dependencias (RF-15, SPEC 21). El efecto de un traslado aprobado lo aplica
// Ticket.trasladar (SPEC 04); aquí queda quién lo pidió, a dónde sugirió y quién lo decidió.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE solicitudes_traslado (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      solicitado_por bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      dependencia_origen_id bigint NOT NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
      dependencia_sugerida_id bigint NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
      motivo text NOT NULL,
      estado text NOT NULL DEFAULT 'pendiente',
      resuelto_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      motivo_resolucion text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      resuelto_en timestamptz NULL,
      CONSTRAINT solicitudes_traslado_sugerida_distinta CHECK (dependencia_sugerida_id <> dependencia_origen_id),
      CONSTRAINT solicitudes_traslado_motivo_largo CHECK (char_length(motivo) BETWEEN 1 AND 1000),
      CONSTRAINT solicitudes_traslado_estado_check
        CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'retirada', 'sin_efecto'))
    )
  `);

  // Como máximo una solicitud pendiente por queja: la base lo garantiza aunque dos lleguen a la vez.
  await knex.raw(
    `CREATE UNIQUE INDEX solicitudes_traslado_una_pendiente ON solicitudes_traslado (ticket_id) WHERE estado = 'pendiente'`,
  );
  await knex.raw('CREATE INDEX solicitudes_traslado_estado_creado_en_idx ON solicitudes_traslado (estado, creado_en)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE solicitudes_traslado');
}
