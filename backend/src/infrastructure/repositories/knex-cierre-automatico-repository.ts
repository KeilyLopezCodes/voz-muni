import type { Knex } from 'knex';
import type { CierreAutomaticoRepository } from '../../domain/repositories/cierre-automatico-repository';

export class KnexCierreAutomaticoRepository implements CierreAutomaticoRepository {
  constructor(private readonly db: Knex) {}

  async reclamarVencidas(ahora: Date, limite: number): Promise<number[]> {
    // Usa tickets_confirmacion_pendiente_idx (0028). Otra transacción que corra a la vez salta las filas bloqueadas.
    const filas: { id: string }[] = await this.db('tickets')
      .where('estado', 'resuelta')
      .where('confirmacion_vence_en', '<', ahora)
      .orderBy([{ column: 'confirmacion_vence_en' }, { column: 'id' }])
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select('id');
    return filas.map((fila) => Number(fila.id));
  }

  async contarSinPlazo(): Promise<number> {
    const [{ total }] = await this.db('tickets')
      .where('estado', 'resuelta')
      .whereNull('confirmacion_vence_en')
      .count({ total: '*' });
    return Number(total);
  }
}
