import type { Knex } from 'knex';
import type { CampoExtra } from '../../domain/categorias/campo-extra';
import type { CategoriaAdminRepository } from '../../domain/repositories/categoria-admin-repository';
import type { CategoriaFormulario } from '../../domain/repositories/catalogo-lectura-repository';

export class KnexCategoriaAdminRepository implements CategoriaAdminRepository {
  constructor(private readonly db: Knex) {}

  async obtenerParaActualizar(categoriaId: number): Promise<CategoriaFormulario | null> {
    const fila: { id: string; nombre: string; campos_extra: CampoExtra[] } | undefined = await this.db('categorias')
      .where({ id: categoriaId })
      .forUpdate()
      .first('id', 'nombre', 'campos_extra');
    return fila ? { id: Number(fila.id), nombre: fila.nombre, camposExtra: fila.campos_extra } : null;
  }

  async tieneTickets(categoriaId: number): Promise<boolean> {
    return (await this.db('tickets').where({ categoria_id: categoriaId }).first('id')) !== undefined;
  }

  async guardarCampos(categoriaId: number, campos: CampoExtra[]): Promise<void> {
    await this.db('categorias')
      .where({ id: categoriaId })
      .update({ campos_extra: JSON.stringify(campos) });
  }
}
