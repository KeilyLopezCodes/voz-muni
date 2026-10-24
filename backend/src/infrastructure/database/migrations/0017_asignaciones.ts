import type { Knex } from 'knex';

// Registro de asignaciones y reasignaciones de técnico (RF-14, SPEC 20), para la línea de tiempo (RF-25).
// ticket_historial sigue siendo solo de cambios de estado.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE ticket_asignaciones (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      tecnico_anterior bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      tecnico_nuevo bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      asignado_por bigint NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      motivo text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ticket_asignaciones_con_cambio CHECK (tecnico_anterior IS DISTINCT FROM tecnico_nuevo)
    )
  `);

  await knex.raw('CREATE INDEX ticket_asignaciones_ticket_creado_en_idx ON ticket_asignaciones (ticket_id, creado_en)');

  // Mismo patrón que bitacora (SPEC 03): solo de inserción, aunque un error del código intente modificarla.
  await knex.raw(`
    CREATE FUNCTION ticket_asignaciones_solo_insercion() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'ticket_asignaciones es solo de inserción';
    END;
    $$
  `);

  await knex.raw(`
    CREATE TRIGGER ticket_asignaciones_sin_cambios
      BEFORE UPDATE OR DELETE ON ticket_asignaciones
      FOR EACH ROW EXECUTE FUNCTION ticket_asignaciones_solo_insercion()
  `);

  await knex.raw(`
    CREATE TRIGGER ticket_asignaciones_sin_truncate
      BEFORE TRUNCATE ON ticket_asignaciones
      FOR EACH STATEMENT EXECUTE FUNCTION ticket_asignaciones_solo_insercion()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER ticket_asignaciones_sin_truncate ON ticket_asignaciones');
  await knex.raw('DROP TRIGGER ticket_asignaciones_sin_cambios ON ticket_asignaciones');
  await knex.raw('DROP FUNCTION ticket_asignaciones_solo_insercion()');
  await knex.raw('DROP TABLE ticket_asignaciones');
}
