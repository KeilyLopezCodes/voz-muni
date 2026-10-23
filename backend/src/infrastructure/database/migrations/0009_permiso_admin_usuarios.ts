import type { Knex } from 'knex';

// Acción admin.usuarios (RF-04, SPEC 10), separada de admin.catalogos. Solo para el rol administrador.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`UPDATE roles SET permisos = permisos || '{"admin.usuarios": "si"}' WHERE nombre = 'administrador'`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`UPDATE roles SET permisos = permisos - 'admin.usuarios' WHERE nombre = 'administrador'`);
}
