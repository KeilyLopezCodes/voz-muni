import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Los 8 estados del ciclo de vida (sección 3). "Escalada" es la bandera tickets.escalado, no un estado.
  await knex.raw(`
    CREATE TYPE estado_ticket AS ENUM (
      'nueva', 'en_revision', 'rechazada', 'asignada', 'en_proceso', 'en_espera', 'resuelta', 'cerrada'
    )
  `);

  // El formato de numero se valida aquí; el correlativo lo genera la aplicación (RF-08).
  // dependencia_id y prioridad se definen en la revisión (RF-12, RF-13).
  await knex.raw(`
    CREATE TABLE tickets (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      numero text NOT NULL UNIQUE CHECK (numero ~ '^Q-[0-9]{4}-[0-9]{6}$'),
      solicitante_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      categoria_id bigint NOT NULL REFERENCES categorias (id) ON DELETE RESTRICT,
      dependencia_id bigint NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
      asignado_a bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      estado estado_ticket NOT NULL DEFAULT 'nueva',
      prioridad text NULL CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
      canal text NOT NULL CHECK (canal IN ('portal', 'ventanilla', 'telefono', 'redes', 'correo')),
      zona_id bigint NOT NULL REFERENCES zonas (id) ON DELETE RESTRICT,
      direccion text NOT NULL,
      lat numeric(9, 6) NULL,
      lng numeric(9, 6) NULL,
      datos_extra jsonb NOT NULL DEFAULT '{}',
      vence_respuesta timestamptz NULL,
      vence_resolucion timestamptz NULL,
      escalado boolean NOT NULL DEFAULT false,
      creado_en timestamptz NOT NULL DEFAULT now(),
      resuelto_en timestamptz NULL,
      cerrado_en timestamptz NULL
    )
  `);

  await knex.raw('CREATE INDEX tickets_estado_dependencia_idx ON tickets (estado, dependencia_id)');
  await knex.raw('CREATE INDEX tickets_asignado_estado_idx ON tickets (asignado_a, estado)');
  await knex.raw('CREATE INDEX tickets_vence_resolucion_idx ON tickets (vence_resolucion)');

  // estado_anterior es NULL en la creación; usuario_id es NULL en transiciones del sistema.
  await knex.raw(`
    CREATE TABLE ticket_historial (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      estado_anterior estado_ticket NULL,
      estado_nuevo estado_ticket NOT NULL,
      usuario_id bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      motivo text NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Línea de tiempo del ticket (RF-25).
  await knex.raw('CREATE INDEX ticket_historial_ticket_creado_idx ON ticket_historial (ticket_id, creado_en)');

  await knex.raw(`
    CREATE TABLE comentarios (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      autor_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      cuerpo text NOT NULL,
      es_interno boolean NOT NULL DEFAULT false,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex.raw('CREATE INDEX comentarios_ticket_idx ON comentarios (ticket_id)');

  // El tamaño y tipo permitidos son reglas configurables de la aplicación, no de la base.
  await knex.raw(`
    CREATE TABLE adjuntos (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      comentario_id bigint NULL REFERENCES comentarios (id) ON DELETE RESTRICT,
      nombre text NOT NULL,
      ruta text NOT NULL,
      tipo_mime text NOT NULL,
      tamano_bytes integer NOT NULL CHECK (tamano_bytes > 0)
    )
  `);

  await knex.raw('CREATE INDEX adjuntos_ticket_idx ON adjuntos (ticket_id)');

  await knex.raw(`
    CREATE TABLE encuestas (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL UNIQUE REFERENCES tickets (id) ON DELETE RESTRICT,
      calificacion smallint NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
      comentario text NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  // tipo no lleva CHECK: sus valores los define la spec de notificaciones.
  await knex.raw(`
    CREATE TABLE notificaciones (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      ticket_id bigint NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      tipo text NOT NULL,
      leida boolean NOT NULL DEFAULT false,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex.raw('CREATE INDEX notificaciones_usuario_leida_idx ON notificaciones (usuario_id, leida)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE notificaciones');
  await knex.raw('DROP TABLE encuestas');
  await knex.raw('DROP TABLE adjuntos');
  await knex.raw('DROP TABLE comentarios');
  await knex.raw('DROP TABLE ticket_historial');
  await knex.raw('DROP TABLE tickets');
  await knex.raw('DROP TYPE estado_ticket');
}
