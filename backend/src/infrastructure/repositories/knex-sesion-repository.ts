import type { Knex } from 'knex';
import type { NuevaSesion, Sesion, SesionRepository } from '../../domain/repositories/sesion-repository';

// pg devuelve los bigint como string.
interface FilaSesion {
  id: string;
  usuario_id: string;
  expira_en: Date;
  revocada_en: Date | null;
}

function aFila(sesion: NuevaSesion) {
  return { usuario_id: sesion.usuarioId, token_hash: sesion.tokenHash, expira_en: sesion.expiraEn };
}

export class KnexSesionRepository implements SesionRepository {
  constructor(private readonly db: Knex) {}

  async crear(sesion: NuevaSesion): Promise<number> {
    const [fila] = await this.db('sesiones').insert(aFila(sesion)).returning('id');
    return Number(fila.id);
  }

  async buscarPorHash(tokenHash: string): Promise<Sesion | null> {
    const fila: FilaSesion | undefined = await this.db('sesiones')
      .where({ token_hash: tokenHash })
      .first('id', 'usuario_id', 'expira_en', 'revocada_en');
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      usuarioId: Number(fila.usuario_id),
      expiraEn: fila.expira_en,
      revocadaEn: fila.revocada_en,
    };
  }

  async rotar(anteriorId: number, nueva: NuevaSesion, ahora: Date): Promise<number | null> {
    const trx = await this.db.transaction();
    try {
      const [fila] = await trx('sesiones').insert(aFila(nueva)).returning('id');
      const nuevaId = Number(fila.id);
      // La condición sobre revocada_en evita que dos rotaciones simultáneas del mismo token prosperen.
      const revocadas = await trx('sesiones')
        .where({ id: anteriorId })
        .whereNull('revocada_en')
        .update({ revocada_en: ahora, reemplazada_por: nuevaId });
      if (revocadas === 0) {
        await trx.rollback();
        return null;
      }
      await trx.commit();
      return nuevaId;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async revocar(sesionId: number, ahora: Date): Promise<void> {
    await this.db('sesiones').where({ id: sesionId }).whereNull('revocada_en').update({ revocada_en: ahora });
  }

  async revocarTodasDelUsuario(usuarioId: number, ahora: Date): Promise<void> {
    await this.db('sesiones').where({ usuario_id: usuarioId }).whereNull('revocada_en').update({ revocada_en: ahora });
  }
}
