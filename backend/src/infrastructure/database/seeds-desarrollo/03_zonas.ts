import type { Knex } from 'knex';

// Zonas ficticias de desarrollo (SPEC 05).
const ZONAS = [
  { nombre: 'Zona 1', tipo: 'zona' },
  { nombre: 'Zona 2', tipo: 'zona' },
  { nombre: 'Zona 3', tipo: 'zona' },
  { nombre: 'Barrio El Centro', tipo: 'colonia' },
  { nombre: 'Colonia La Esperanza', tipo: 'colonia' },
  { nombre: 'Aldea San José', tipo: 'aldea' },
];

export async function seed(knex: Knex): Promise<void> {
  await knex('zonas').insert(ZONAS).onConflict(['nombre', 'tipo']).ignore();
}
