import type { Knex } from 'knex';

const CATEGORIAS = ['Agua potable', 'Alumbrado público', 'Recolección de basura', 'Baches'];

// Misma matriz para todas las categorías, en horas hábiles (SPEC 05). Baches/media = 72 h es el ejemplo de la sección 1.
const MATRIZ_SLA = [
  { prioridad: 'urgente', horas_respuesta: 2, horas_resolucion: 24 },
  { prioridad: 'alta', horas_respuesta: 8, horas_resolucion: 48 },
  { prioridad: 'media', horas_respuesta: 24, horas_resolucion: 72 },
  { prioridad: 'baja', horas_respuesta: 48, horas_resolucion: 120 },
];

export async function seed(knex: Knex): Promise<void> {
  // La FK se resuelve por nombre: las identidades no son estables entre bases.
  const categorias: { id: number; nombre: string }[] = await knex('categorias')
    .select('id', 'nombre')
    .whereIn('nombre', CATEGORIAS);
  const idPorNombre = new Map(categorias.map((categoria) => [categoria.nombre, categoria.id]));

  const filas = CATEGORIAS.flatMap((nombre) => {
    const categoriaId = idPorNombre.get(nombre);
    if (categoriaId === undefined) {
      throw new Error(`Falta la categoría "${nombre}"; ejecuta 02_categorias antes`);
    }
    return MATRIZ_SLA.map((politica) => ({ categoria_id: categoriaId, ...politica }));
  });

  await knex('politicas_sla').insert(filas).onConflict(['categoria_id', 'prioridad']).ignore();
}
