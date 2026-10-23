import type { Knex } from 'knex';
import type { RestablecimientoRepository } from '../../domain/repositories/restablecimiento-repository';

export class KnexRestablecimientoRepository implements RestablecimientoRepository {
  constructor(private readonly db: Knex) {}

  async invalidarPendientes(usuarioId: number, ahora: Date): Promise<void> {
    await this.db('restablecimientos')
      .where({ usuario_id: usuarioId })
      .whereNull('usado_en')
      .whereNull('invalidado_en')
      .update({ invalidado_en: ahora });
  }

  async crear(usuarioId: number, tokenHash: string, expiraEn: Date): Promise<void> {
    await this.db('restablecimientos').insert({ usuario_id: usuarioId, token_hash: tokenHash, expira_en: expiraEn });
  }

  async buscarVigente(tokenHash: string, ahora: Date): Promise<{ id: number; usuarioId: number } | null> {
    // pg devuelve los bigint como string.
    const fila: { id: string; usuario_id: string } | undefined = await this.db('restablecimientos')
      .where({ token_hash: tokenHash })
      .whereNull('usado_en')
      .whereNull('invalidado_en')
      .where('expira_en', '>', ahora)
      // Dentro de una transacción bloquea la fila: un segundo uso simultáneo del token espera y ya no lo ve vigente.
      .forUpdate()
      .first('id', 'usuario_id');
    return fila ? { id: Number(fila.id), usuarioId: Number(fila.usuario_id) } : null;
  }

  async marcarUsado(id: number, ahora: Date): Promise<void> {
    await this.db('restablecimientos').where({ id }).update({ usado_en: ahora });
  }
}
