import type { Knex } from 'knex';

// Datos ficticios de desarrollo (SPEC 05).
const ZONAS = [
  { nombre: 'Zona 1', tipo: 'zona' },
  { nombre: 'Zona 2', tipo: 'zona' },
  { nombre: 'Zona 3', tipo: 'zona' },
  { nombre: 'Barrio El Centro', tipo: 'colonia' },
  { nombre: 'Colonia La Esperanza', tipo: 'colonia' },
  { nombre: 'Aldea San José', tipo: 'aldea' },
];

export async function seed(knex: Knex): Promise<void> {
  // Idempotente: respeta los cambios hechos a mano y solo agrega lo que falta.
  await knex('zonas').insert(ZONAS).onConflict(['nombre', 'tipo']).ignore();
}
