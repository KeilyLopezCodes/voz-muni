import type { Knex } from 'knex';
import type { CatalogoLecturaRepository } from '../../domain/repositories/catalogo-lectura-repository';

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
}
