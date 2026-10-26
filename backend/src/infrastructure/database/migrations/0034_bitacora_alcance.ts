import type { Knex } from 'knex';

// Bitácora de auditoría (RF-42, SPEC 41): el formato entidad.verbo de las acciones y los índices de la consulta.
// bitacora.dependencia_id y el índice (dependencia_id, creado_en) ya existen desde 0011_alcance (SPEC 11): aquí solo
// se agregan los índices por usuario y por acción. ALTER TABLE no dispara los triggers de fila de 0004: la tabla
// sigue siendo solo de inserción.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE bitacora ADD CONSTRAINT bitacora_accion_formato CHECK (accion ~ '^[a-z_]+\\.[a-z_]+$')`);
  await knex.raw('CREATE INDEX bitacora_usuario_creado_idx ON bitacora (usuario_id, creado_en)');
  await knex.raw('CREATE INDEX bitacora_accion_creado_idx ON bitacora (accion, creado_en)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX bitacora_accion_creado_idx');
  await knex.raw('DROP INDEX bitacora_usuario_creado_idx');
  await knex.raw('ALTER TABLE bitacora DROP CONSTRAINT bitacora_accion_formato');
}
