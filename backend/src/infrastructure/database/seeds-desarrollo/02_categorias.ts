import type { Knex } from 'knex';

// Datos ficticios de desarrollo (SPEC 05). La forma de campos_extra la define la spec de RF-09.
const CATEGORIAS = [
  { nombre: 'Agua potable', dependencia: 'Dirección de Agua Potable' },
  { nombre: 'Alumbrado público', dependencia: 'Dirección de Alumbrado Público' },
  { nombre: 'Recolección de basura', dependencia: 'Dirección de Servicios Públicos' },
  { nombre: 'Baches', dependencia: 'Dirección de Obras' },
];

export async function seed(knex: Knex): Promise<void> {
  // La FK se resuelve por nombre: los ids dependen del orden de inserción de cada base.
  const dependencias: { id: string; nombre: string }[] = await knex('dependencias')
    .select('id', 'nombre')
    .whereIn('nombre', CATEGORIAS.map((categoria) => categoria.dependencia));
  const idPorNombre = new Map(dependencias.map((dependencia) => [dependencia.nombre, dependencia.id]));

  const filas = CATEGORIAS.map(({ nombre, dependencia }) => {
    const dependenciaId = idPorNombre.get(dependencia);
    if (dependenciaId === undefined) {
      throw new Error(`No existe la dependencia '${dependencia}' para la categoría '${nombre}'`);
    }
    return { nombre, dependencia_id: dependenciaId, campos_extra: JSON.stringify([]), activa: true };
  });

  // Idempotente: respeta los cambios hechos a mano y solo agrega lo que falta.
  await knex('categorias').insert(filas).onConflict('nombre').ignore();
}
