import type { Knex } from 'knex';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';

export class KnexParametroRepository implements ParametroRepository {
  constructor(private readonly db: Knex) {}

  async obtener(clave: string): Promise<unknown | null> {
    const fila: { valor: unknown } | undefined = await this.db('parametros').where({ clave }).first('valor');
    return fila ? fila.valor : null;
  }

  async guardar(clave: string, valor: unknown): Promise<void> {
    await this.db('parametros')
      .insert({ clave, valor: JSON.stringify(valor) })
      .onConflict('clave')
      .merge({ valor: JSON.stringify(valor), actualizado_en: this.db.fn.now() });
  }
}
