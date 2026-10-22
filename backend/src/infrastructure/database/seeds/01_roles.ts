import type { Knex } from 'knex';

// Los 6 roles de la sección 2. Los permisos reales los define la spec de autorización.
const ROLES = ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'];

export async function seed(knex: Knex): Promise<void> {
  // Idempotente: ejecutarlo de nuevo no duplica ni modifica roles existentes.
  await knex('roles')
    .insert(ROLES.map((nombre) => ({ nombre, permisos: {} })))
    .onConflict('nombre')
    .ignore();
}
