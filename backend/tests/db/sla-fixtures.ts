import type { Knex } from 'knex';
import { ASUETOS_2026_2027 } from '../../src/infrastructure/database/seed-helpers/asuetos-guatemala';
import { generarCalendario } from '../../src/infrastructure/database/seed-helpers/calendario';

// La matriz de seed:dev, en horas hábiles. Datos de prueba, no de producción.
export const MATRIZ_PRUEBA = [
  { prioridad: 'urgente', horas_respuesta: 2, horas_resolucion: 24 },
  { prioridad: 'alta', horas_respuesta: 8, horas_resolucion: 48 },
  { prioridad: 'media', horas_respuesta: 24, horas_resolucion: 72 },
  { prioridad: 'baja', horas_respuesta: 48, horas_resolucion: 120 },
] as const;

// Lo que necesita aceptar o reabrir desde SPEC 30: el calendario 2026–2027 y la matriz de SLA de cada categoría.
// La jornada laboral la carga la migración 0025.
export async function prepararSla(db: Knex, categoriaIds: readonly number[]): Promise<void> {
  await db('calendario_laboral')
    .insert(generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027))
    .onConflict('fecha')
    .ignore();
  const filas = categoriaIds.flatMap((categoriaId) => MATRIZ_PRUEBA.map((plazo) => ({ categoria_id: categoriaId, ...plazo })));
  if (filas.length > 0) {
    await db('politicas_sla').insert(filas).onConflict(['categoria_id', 'prioridad']).ignore();
  }
}
