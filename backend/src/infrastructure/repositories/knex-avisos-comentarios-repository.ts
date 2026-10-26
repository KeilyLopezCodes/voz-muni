import type { Knex } from 'knex';
import type { EstadoAvisoComentarios } from '../../domain/notificaciones/aviso-comentarios';
import type {
  AvisosComentariosRepository,
  QuejaConAvisoPendiente,
} from '../../domain/repositories/avisos-comentarios-repository';

// pg devuelve los bigint como string.
interface FilaPendiente {
  id: string;
  numero: string;
  titulo: string;
  solicitante_id: string;
  solicitante_nombre: string;
  solicitante_email: string | null;
  avisos_comentario_pendientes: number;
}

export class KnexAvisosComentariosRepository implements AvisosComentariosRepository {
  constructor(private readonly db: Knex) {}

  async obtenerEstado(ticketId: number): Promise<EstadoAvisoComentarios> {
    const fila: { aviso_comentario_en: Date | null; avisos_comentario_pendientes: number } = await this.db('tickets')
      .where({ id: ticketId })
      .first('aviso_comentario_en', 'avisos_comentario_pendientes');
    return { avisoComentarioEn: fila.aviso_comentario_en, pendientes: fila.avisos_comentario_pendientes };
  }

  async guardarEstado(ticketId: number, estado: EstadoAvisoComentarios): Promise<void> {
    await this.db('tickets')
      .where({ id: ticketId })
      .update({ aviso_comentario_en: estado.avisoComentarioEn, avisos_comentario_pendientes: estado.pendientes });
  }

  async reclamarVencidos(cerradaHasta: Date, limite: number): Promise<QuejaConAvisoPendiente[]> {
    // Usa tickets_avisos_comentario_pendientes_idx (0030). FOR UPDATE OF t: el solicitante no se bloquea.
    const filas: FilaPendiente[] = await this.db('tickets as t')
      .join('usuarios as u', 'u.id', 't.solicitante_id')
      .where('t.avisos_comentario_pendientes', '>', 0)
      .where('t.aviso_comentario_en', '<=', cerradaHasta)
      .orderBy([{ column: 't.aviso_comentario_en' }, { column: 't.id' }])
      .limit(limite)
      .forUpdate('t')
      .skipLocked()
      .select(
        't.id',
        't.numero',
        't.titulo',
        't.solicitante_id',
        'u.nombre as solicitante_nombre',
        'u.email as solicitante_email',
        't.avisos_comentario_pendientes',
      );
    return filas.map((fila) => ({
      ticketId: Number(fila.id),
      numero: fila.numero,
      titulo: fila.titulo,
      solicitante: { id: Number(fila.solicitante_id), nombre: fila.solicitante_nombre, email: fila.solicitante_email },
      pendientes: fila.avisos_comentario_pendientes,
    }));
  }
}
