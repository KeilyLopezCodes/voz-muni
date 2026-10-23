import type { Knex } from 'knex';

// Datos ficticios de desarrollo (SPEC 05). El coordinador se asigna cuando existan usuarios.
const DEPENDENCIAS = [
  'Dirección de Agua Potable',
  'Dirección de Alumbrado Público',
  'Dirección de Servicios Públicos',
  'Dirección de Obras',
];

export async function seed(knex: Knex): Promise<void> {
  // Idempotente: respeta los cambios hechos a mano y solo agrega lo que falta.
  await knex('dependencias')
    .insert(DEPENDENCIAS.map((nombre) => ({ nombre, activa: true, coordinador_id: null })))
    .onConflict('nombre')
    .ignore();
}
