import type { Knex } from 'knex';
import type {
  NotificacionLeida,
  NotificacionRepository,
  NuevaNotificacion,
} from '../../domain/repositories/notificacion-repository';

// pg devuelve los bigint como string.
interface FilaNotificacion {
  id: string;
  tipo: string;
  leida: boolean;
  creado_en: Date;
  datos: Record<string, unknown>;
  ticket_id: string | null;
  ticket_numero: string | null;
  ticket_titulo: string | null;
}

function aNotificacion(fila: FilaNotificacion): NotificacionLeida {
  return {
    id: Number(fila.id),
    tipo: fila.tipo,
    leida: fila.leida,
    creadoEn: fila.creado_en,
    ticket:
      fila.ticket_id === null
        ? null
        : { id: Number(fila.ticket_id), numero: fila.ticket_numero!, titulo: fila.ticket_titulo! },
    datos: fila.datos,
  };
}

export class KnexNotificacionRepository implements NotificacionRepository {
  constructor(private readonly db: Knex) {}

  async crear(notificaciones: readonly NuevaNotificacion[]): Promise<void> {
    if (notificaciones.length === 0) {
      return;
    }
    await this.db('notificaciones').insert(
      notificaciones.map((n) => ({
        usuario_id: n.usuarioId,
        ticket_id: n.ticketId,
        tipo: n.tipo,
        datos: JSON.stringify(n.datos),
        creado_en: n.creadoEn,
      })),
    );
  }

  async listar(usuarioId: number, limite: number): Promise<NotificacionLeida[]> {
    const filas: FilaNotificacion[] = await this.consulta()
      .where('n.usuario_id', usuarioId)
      .orderBy([
        { column: 'n.creado_en', order: 'desc' },
        { column: 'n.id', order: 'desc' },
      ])
      .limit(limite);
    return filas.map(aNotificacion);
  }

  async contarNoLeidas(usuarioId: number): Promise<number> {
    const [{ total }] = await this.db('notificaciones').where({ usuario_id: usuarioId, leida: false }).count({ total: '*' });
    return Number(total);
  }

  async marcarLeida(usuarioId: number, id: number): Promise<NotificacionLeida | null> {
    const actualizadas = await this.db('notificaciones').where({ id, usuario_id: usuarioId }).update({ leida: true });
    if (actualizadas === 0) {
      return null;
    }
    const fila: FilaNotificacion | undefined = await this.consulta().where('n.id', id).first();
    return fila ? aNotificacion(fila) : null;
  }

  async marcarTodasLeidas(usuarioId: number): Promise<void> {
    await this.db('notificaciones').where({ usuario_id: usuarioId, leida: false }).update({ leida: true });
  }

  private consulta(): Knex.QueryBuilder {
    return this.db('notificaciones as n')
      .leftJoin('tickets as t', 't.id', 'n.ticket_id')
      .select(
        'n.id',
        'n.tipo',
        'n.leida',
        'n.creado_en',
        'n.datos',
        'n.ticket_id',
        't.numero as ticket_numero',
        't.titulo as ticket_titulo',
      );
  }
}
