import type { Knex } from 'knex';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import type { MatrizSla, PlazoSla } from '../../domain/sla/politica-sla';
import { PRIORIDADES, type Prioridad } from '../../domain/ticket/prioridad';

interface FilaCategoria {
  id: string;
  nombre: string;
  activa: boolean;
  dependencia_id: string;
  dependencia_nombre: string;
}

interface FilaPolitica {
  categoria_id: string;
  prioridad: Prioridad;
  horas_respuesta: number;
  horas_resolucion: number;
  actualizado_en: Date;
  actualizado_por: string | null;
  actualizado_por_nombre: string | null;
}

export class KnexPoliticaSlaRepository implements PoliticaSlaRepository {
  constructor(private readonly db: Knex) {}

  listarPorCategoria(): Promise<CategoriaConSla[]> {
    return this.leer();
  }

  async obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null> {
    return (await this.leer(categoriaId))[0] ?? null;
  }

  async reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<boolean> {
    // Dos PUT simultáneos sobre la misma categoría se aplican uno después del otro.
    const categoria = await this.db('categorias').where({ id: categoriaId }).forUpdate().first('id');
    if (!categoria) {
      return false;
    }
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
    return true;
  }

  async obtenerPlazo(categoriaId: number, prioridad: Prioridad): Promise<PlazoSla | null> {
    const fila: Pick<FilaPolitica, 'prioridad' | 'horas_respuesta' | 'horas_resolucion'> | undefined = await this.db(
      'politicas_sla',
    )
      .where({ categoria_id: categoriaId, prioridad })
      .first('prioridad', 'horas_respuesta', 'horas_resolucion');
    return fila
      ? { prioridad: fila.prioridad, horasRespuesta: fila.horas_respuesta, horasResolucion: fila.horas_resolucion }
      : null;
  }

  private async leer(categoriaId?: number): Promise<CategoriaConSla[]> {
    const consultaCategorias = this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .select('c.id', 'c.nombre', 'c.activa', 'c.dependencia_id', 'd.nombre as dependencia_nombre')
      .orderBy('c.nombre');
    const consultaPoliticas = this.db('politicas_sla as p')
      .leftJoin('usuarios as u', 'u.id', 'p.actualizado_por')
      .select(
        'p.categoria_id',
        'p.prioridad',
        'p.horas_respuesta',
        'p.horas_resolucion',
        'p.actualizado_en',
        'p.actualizado_por',
        'u.nombre as actualizado_por_nombre',
      );
    if (categoriaId !== undefined) {
      consultaCategorias.where('c.id', categoriaId);
      consultaPoliticas.where('p.categoria_id', categoriaId);
    }
    const [categorias, politicas]: [FilaCategoria[], FilaPolitica[]] = await Promise.all([
      consultaCategorias,
      consultaPoliticas,
    ]);
    return categorias.map((c) => {
      const propias = politicas
        .filter((p) => p.categoria_id === c.id)
        .sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));
      const reciente = [...propias].sort((a, b) => b.actualizado_en.getTime() - a.actualizado_en.getTime())[0];
      return {
        categoria: { id: Number(c.id), nombre: c.nombre, activa: c.activa },
        dependencia: { id: Number(c.dependencia_id), nombre: c.dependencia_nombre },
        plazos: propias.map((p) => ({
          prioridad: p.prioridad,
          horasRespuesta: p.horas_respuesta,
          horasResolucion: p.horas_resolucion,
        })),
        completa: propias.length === PRIORIDADES.length,
        actualizadoEn: reciente?.actualizado_en ?? null,
        actualizadoPor:
          reciente && reciente.actualizado_por !== null
            ? { id: Number(reciente.actualizado_por), nombre: reciente.actualizado_por_nombre ?? '' }
            : null,
      };
    });
  }
}
