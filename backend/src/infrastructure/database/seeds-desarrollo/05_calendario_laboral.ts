import type { Knex } from 'knex';
import { ASUETOS_2026_2027 } from '../seed-helpers/asuetos-guatemala';
import { generarCalendario } from '../seed-helpers/calendario';

// Datos ficticios de desarrollo (SPEC 05). En producción el administrador carga el calendario oficial.
const TAMANO_LOTE = 200;

export async function seed(knex: Knex): Promise<void> {
  const filas = generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027);

  // Idempotente: respeta los cambios hechos a mano y solo agrega lo que falta.
  for (let inicio = 0; inicio < filas.length; inicio += TAMANO_LOTE) {
    await knex('calendario_laboral')
      .insert(filas.slice(inicio, inicio + TAMANO_LOTE))
      .onConflict('fecha')
      .ignore();
  }
}
