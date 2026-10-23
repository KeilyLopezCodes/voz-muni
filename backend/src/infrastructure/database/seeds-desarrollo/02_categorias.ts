import type { Knex } from 'knex';

// Categorías ficticias de desarrollo (SPEC 05). campos_extra queda vacío hasta la spec de RF-09.
const CATEGORIAS = [
  { nombre: 'Agua potable', dependencia: 'Dirección de Agua Potable' },
  { nombre: 'Alumbrado público', dependencia: 'Dirección de Alumbrado Público' },
  { nombre: 'Recolección de basura', dependencia: 'Dirección de Servicios Públicos' },
  { nombre: 'Baches', dependencia: 'Dirección de Obras' },
];

export async function seed(knex: Knex): Promise<void> {
  // La FK se resuelve por nombre: las identidades no son estables entre bases.
  const dependencias: { id: number; nombre: string }[] = await knex('dependencias')
    .select('id', 'nombre')
    .whereIn('nombre', CATEGORIAS.map((categoria) => categoria.dependencia));
  const idPorNombre = new Map(dependencias.map((dependencia) => [dependencia.nombre, dependencia.id]));

  const filas = CATEGORIAS.map((categoria) => {
    const dependenciaId = idPorNombre.get(categoria.dependencia);
    if (dependenciaId === undefined) {
      throw new Error(`Falta la dependencia "${categoria.dependencia}"; ejecuta 01_dependencias antes`);
    }
    return { nombre: categoria.nombre, dependencia_id: dependenciaId, campos_extra: JSON.stringify([]), activa: true };
  });

  await knex('categorias').insert(filas).onConflict('nombre').ignore();
}
