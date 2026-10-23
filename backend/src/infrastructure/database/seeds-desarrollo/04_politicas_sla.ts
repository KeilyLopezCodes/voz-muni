import type { Knex } from 'knex';

// Datos ficticios de desarrollo (SPEC 05). La misma matriz, en horas hábiles, para cada categoría;
// las diferencias por categoría las configura el administrador.
const CATEGORIAS = ['Agua potable', 'Alumbrado público', 'Recolección de basura', 'Baches'];

const MATRIZ_SLA = [
  { prioridad: 'urgente', horas_respuesta: 2, horas_resolucion: 24 },
  { prioridad: 'alta', horas_respuesta: 8, horas_resolucion: 48 },
  { prioridad: 'media', horas_respuesta: 24, horas_resolucion: 72 },
  { prioridad: 'baja', horas_respuesta: 48, horas_resolucion: 120 },
];

export async function seed(knex: Knex): Promise<void> {
  // La FK se resuelve por nombre: los ids dependen del orden de inserción de cada base.
  const categorias: { id: string; nombre: string }[] = await knex('categorias')
    .select('id', 'nombre')
    .whereIn('nombre', CATEGORIAS);
  const idPorNombre = new Map(categorias.map((categoria) => [categoria.nombre, categoria.id]));

  const filas = CATEGORIAS.flatMap((nombre) => {
    const categoriaId = idPorNombre.get(nombre);
    if (categoriaId === undefined) {
      throw new Error(`No existe la categoría '${nombre}' para sus políticas SLA`);
    }
    return MATRIZ_SLA.map((politica) => ({ categoria_id: categoriaId, ...politica }));
  });

  // Idempotente: respeta los cambios hechos a mano y solo agrega lo que falta.
  await knex('politicas_sla').insert(filas).onConflict(['categoria_id', 'prioridad']).ignore();
}
