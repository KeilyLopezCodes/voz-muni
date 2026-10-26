import type { Knex } from 'knex';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import type { MatrizSla } from '../../domain/sla/politica-sla';
import { PRIORIDADES, type Prioridad } from '../../domain/ticket/prioridad';

// pg devuelve los bigint como string. Una fila por política; las categorías sin políticas traen prioridad NULL.
interface FilaSla {
  categoria_id: string;
  categoria_nombre: string;
  activa: boolean;
  dependencia_id: string;
  dependencia_nombre: string;
  prioridad: Prioridad | null;
  horas_respuesta: number | null;
  horas_resolucion: number | null;
  actualizado_en: Date | null;
  actualizado_por_id: string | null;
  actualizado_por_nombre: string | null;
}

function agrupar(filas: FilaSla[]): CategoriaConSla[] {
  const porCategoria = new Map<string, CategoriaConSla>();
  for (const fila of filas) {
    let actual = porCategoria.get(fila.categoria_id);
    if (!actual) {
      actual = {
        categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre, activa: fila.activa },
        dependencia: { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre },
        plazos: [],
        completa: false,
        actualizadoEn: null,
        actualizadoPor: null,
      };
      porCategoria.set(fila.categoria_id, actual);
    }
    if (fila.prioridad === null || fila.actualizado_en === null) {
      continue;
    }
    actual.plazos.push({
      prioridad: fila.prioridad,
      horasRespuesta: fila.horas_respuesta!,
      horasResolucion: fila.horas_resolucion!,
    });
    // La última actualización es la de la fila más reciente, con su autor.
    if (actual.actualizadoEn === null || fila.actualizado_en.getTime() > actual.actualizadoEn.getTime()) {
      actual.actualizadoEn = fila.actualizado_en;
      actual.actualizadoPor =
        fila.actualizado_por_id === null
          ? null
          : { id: Number(fila.actualizado_por_id), nombre: fila.actualizado_por_nombre! };
    }
  }
  const resultado = [...porCategoria.values()];
  for (const categoria of resultado) {
    categoria.plazos.sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));
    categoria.completa = PRIORIDADES.every((p) => categoria.plazos.some((plazo) => plazo.prioridad === p));
  }
  return resultado;
}

export class KnexPoliticaSlaRepository implements PoliticaSlaRepository {
  constructor(private readonly db: Knex) {}

  async listarPorCategoria(): Promise<CategoriaConSla[]> {
    return agrupar(await this.consulta().orderBy([{ column: 'c.nombre' }, { column: 'c.id' }]));
  }

  async obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null> {
    const [categoria] = agrupar(await this.consulta().where('c.id', categoriaId));
    return categoria ?? null;
  }

  async reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<void> {
    // Dos PUT simultáneos sobre la misma categoría se aplican uno después del otro.
    await this.db('categorias').where({ id: categoriaId }).forUpdate().first('id');
    // Upsert: una categoría con filas sueltas (cargadas por SQL) queda completa.
    await this.db('politicas_sla')
      .insert(
        matriz.map((plazo) => ({
          categoria_id: categoriaId,
          prioridad: plazo.prioridad,
          horas_respuesta: plazo.horasRespuesta,
          horas_resolucion: plazo.horasResolucion,
          actualizado_en: ahora,
          actualizado_por: usuarioId,
        })),
      )
      .onConflict(['categoria_id', 'prioridad'])
      .merge(['horas_respuesta', 'horas_resolucion', 'actualizado_en', 'actualizado_por']);
  }

  private consulta(): Knex.QueryBuilder {
    return this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .leftJoin('politicas_sla as p', 'p.categoria_id', 'c.id')
      .leftJoin('usuarios as u', 'u.id', 'p.actualizado_por')
      .select(
        'c.id as categoria_id',
        'c.nombre as categoria_nombre',
        'c.activa',
        'd.id as dependencia_id',
        'd.nombre as dependencia_nombre',
        'p.prioridad',
        'p.horas_respuesta',
        'p.horas_resolucion',
        'p.actualizado_en',
        'u.id as actualizado_por_id',
        'u.nombre as actualizado_por_nombre',
      );
  }
}
