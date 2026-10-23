import type { Knex } from 'knex';
import { ASUETOS_2026_2027 } from '../seed-helpers/asuetos-guatemala';
import { generarCalendario } from '../seed-helpers/calendario';

const TAMANO_LOTE = 200;

// Calendario ficticio de desarrollo (SPEC 05). En producción lo carga el administrador.
export async function seed(knex: Knex): Promise<void> {
  const filas = generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027);

  for (let inicio = 0; inicio < filas.length; inicio += TAMANO_LOTE) {
    await knex('calendario_laboral')
      .insert(filas.slice(inicio, inicio + TAMANO_LOTE))
      .onConflict('fecha')
      .ignore();
  }
}
