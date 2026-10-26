import type { Knex } from 'knex';

// Administración de dependencias, categorías y zonas (RF-41, SPEC 40): las zonas también se desactivan, los nombres
// tienen un largo acotado y no se repiten sin distinguir mayúsculas (las zonas, dentro de su tipo), y
// dependencias.coordinador_id queda marcado como obsoleto.
const TABLAS = ['dependencias', 'categorias', 'zonas'] as const;

const COMENTARIO_COORDINADOR =
  'Obsoleto: los coordinadores se identifican por permiso y dependencia (SPEC 31, 36, 40). No se administra.';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE zonas ADD COLUMN activa boolean NOT NULL DEFAULT true');
  for (const tabla of TABLAS) {
    await knex.raw(`ALTER TABLE ${tabla} ADD CONSTRAINT ${tabla}_nombre_largo CHECK (char_length(nombre) BETWEEN 1 AND 120)`);
  }
  await knex.raw('CREATE UNIQUE INDEX dependencias_nombre_ci_uq ON dependencias (lower(nombre))');
  await knex.raw('CREATE UNIQUE INDEX categorias_nombre_ci_uq ON categorias (lower(nombre))');
  await knex.raw('CREATE UNIQUE INDEX zonas_nombre_tipo_ci_uq ON zonas (lower(nombre), tipo)');
  await knex.raw(`COMMENT ON COLUMN dependencias.coordinador_id IS '${COMENTARIO_COORDINADOR}'`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('COMMENT ON COLUMN dependencias.coordinador_id IS NULL');
  await knex.raw('DROP INDEX zonas_nombre_tipo_ci_uq');
  await knex.raw('DROP INDEX categorias_nombre_ci_uq');
  await knex.raw('DROP INDEX dependencias_nombre_ci_uq');
  for (const tabla of [...TABLAS].reverse()) {
    await knex.raw(`ALTER TABLE ${tabla} DROP CONSTRAINT ${tabla}_nombre_largo`);
  }
  await knex.raw('ALTER TABLE zonas DROP COLUMN activa');
}
