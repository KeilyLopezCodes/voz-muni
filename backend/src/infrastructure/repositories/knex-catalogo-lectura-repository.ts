import type { Knex } from 'knex';
import type { CampoExtra } from '../../domain/categorias/campo-extra';
import type {
  CatalogoLecturaRepository,
  CategoriaConDependencia,
  DependenciaActiva,
  Zona,
} from '../../domain/repositories/catalogo-lectura-repository';

export class KnexCatalogoLecturaRepository implements CatalogoLecturaRepository {
  constructor(private readonly db: Knex) {}

  async categoriaRegistrable(categoriaId: number): Promise<boolean> {
    const fila = await this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .where({ 'c.id': categoriaId, 'c.activa': true, 'd.activa': true })
      .first('c.id');
    return fila !== undefined;
  }

  async zonaExiste(zonaId: number): Promise<boolean> {
    return (await this.db('zonas').where({ id: zonaId }).first('id')) !== undefined;
  }

  async listarCategoriasActivas(): Promise<CategoriaConDependencia[]> {
    const filas: {
      id: string;
      nombre: string;
      campos_extra: CampoExtra[];
      dependencia_id: string;
      dependencia_nombre: string;
    }[] = await this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .where({ 'c.activa': true, 'd.activa': true })
      .select('c.id', 'c.nombre', 'c.campos_extra', 'c.dependencia_id', 'd.nombre as dependencia_nombre')
      .orderBy('c.nombre');
    return filas.map((fila) => ({
      id: Number(fila.id),
      nombre: fila.nombre,
      camposExtra: fila.campos_extra,
      dependencia: { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre },
    }));
  }

  async listarDependenciasActivas(): Promise<DependenciaActiva[]> {
    const filas: { id: string; nombre: string }[] = await this.db('dependencias')
      .where({ activa: true })
      .select('id', 'nombre')
      .orderBy([{ column: 'nombre' }, { column: 'id' }]);
    return filas.map((fila) => ({ id: Number(fila.id), nombre: fila.nombre }));
  }

  async listarZonas(): Promise<Zona[]> {
    const filas: { id: string; nombre: string; tipo: string }[] = await this.db('zonas')
      .select('id', 'nombre', 'tipo')
      .orderBy([{ column: 'tipo' }, { column: 'nombre' }]);
    return filas.map((fila) => ({ ...fila, id: Number(fila.id) }));
  }
}
