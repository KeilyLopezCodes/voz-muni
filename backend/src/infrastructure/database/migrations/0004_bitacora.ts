import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // entidad_id es text para cubrir claves no numéricas, como calendario_laboral.fecha.
  await knex.raw(`
    CREATE TABLE bitacora (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      accion text NOT NULL,
      entidad text NOT NULL,
      entidad_id text NULL,
      detalle jsonb NOT NULL DEFAULT '{}',
      ip inet NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex.raw('CREATE INDEX bitacora_entidad_idx ON bitacora (entidad, entidad_id)');
  await knex.raw('CREATE INDEX bitacora_creado_en_idx ON bitacora (creado_en)');

  // RNF-13: la bitácora es solo de inserción, aunque un error del código intente modificarla.
  await knex.raw(`
    CREATE FUNCTION bitacora_solo_insercion() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'bitacora es solo de inserción';
    END;
    $$
  `);

  await knex.raw(`
    CREATE TRIGGER bitacora_sin_cambios
      BEFORE UPDATE OR DELETE ON bitacora
      FOR EACH ROW EXECUTE FUNCTION bitacora_solo_insercion()
  `);

  await knex.raw(`
    CREATE TRIGGER bitacora_sin_truncate
      BEFORE TRUNCATE ON bitacora
      FOR EACH STATEMENT EXECUTE FUNCTION bitacora_solo_insercion()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER bitacora_sin_truncate ON bitacora');
  await knex.raw('DROP TRIGGER bitacora_sin_cambios ON bitacora');
  await knex.raw('DROP FUNCTION bitacora_solo_insercion()');
  await knex.raw('DROP TABLE bitacora');
}
