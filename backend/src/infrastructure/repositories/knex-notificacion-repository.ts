import type { Knex } from 'knex';
import type {
  NotificacionLeida,
  NotificacionRepository,
  NuevaNotificacion,
} from '../../domain/repositories/notificacion-repository';

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
    datos: fila.datos ?? {},
    ticket:
      fila.ticket_id === null
        ? null
        : { id: Number(fila.ticket_id), numero: fila.ticket_numero ?? '', titulo: fila.ticket_titulo ?? '' },
  };
}

export class KnexNotificacionRepository implements NotificacionRepository {
  constructor(private readonly db: Knex) {}

  async crear(filas: readonly NuevaNotificacion[]): Promise<void> {
    if (filas.length === 0) {
      return;
    }
    await this.db('notificaciones').insert(
      filas.map((fila) => ({
        usuario_id: fila.usuarioId,
        ticket_id: fila.ticketId,
        tipo: fila.tipo,
        datos: JSON.stringify(fila.datos),
        creado_en: fila.creadoEn,
      })),
    );
  }

  async agruparComentario(usuarioId: number, ticketId: number, interno: boolean, ahora: Date): Promise<void> {
    await this.db.raw(
      `INSERT INTO notificaciones (usuario_id, ticket_id, tipo, datos, creado_en)
       VALUES (:usuarioId, :ticketId, 'comentario_nuevo', jsonb_build_object('cantidad', 1, 'incluyeInternas', :interno::boolean), :ahora)
       ON CONFLICT (usuario_id, ticket_id) WHERE tipo = 'comentario_nuevo' AND NOT leida
       DO UPDATE SET
         datos = jsonb_build_object(
           'cantidad', COALESCE((notificaciones.datos->>'cantidad')::int, 0) + 1,
           'incluyeInternas', COALESCE((notificaciones.datos->>'incluyeInternas')::boolean, false) OR :interno::boolean),
         creado_en = EXCLUDED.creado_en`,
      { usuarioId, ticketId, interno, ahora },
    );
  }

  async listar(usuarioId: number, limite: number): Promise<{ datos: NotificacionLeida[]; noLeidas: number }> {
    const filas: FilaNotificacion[] = await this.consulta()
      .where('n.usuario_id', usuarioId)
      .orderBy([
        { column: 'n.creado_en', order: 'desc' },
        { column: 'n.id', order: 'desc' },
      ])
      .limit(limite);
    const [{ total }] = await this.db('notificaciones').where({ usuario_id: usuarioId, leida: false }).count({ total: '*' });
    return { datos: filas.map(aNotificacion), noLeidas: Number(total) };
  }

  async marcarLeida(id: number, usuarioId: number, ahora: Date): Promise<NotificacionLeida | null> {
    const actualizadas = await this.db('notificaciones')
      .where({ id, usuario_id: usuarioId })
      .update({ leida: true, leida_en: this.db.raw('COALESCE(leida_en, ?)', [ahora]) });
    if (actualizadas === 0) {
      return null;
    }
    const fila: FilaNotificacion | undefined = await this.consulta().where('n.id', id).first();
    return fila ? aNotificacion(fila) : null;
  }

  async marcarTodas(usuarioId: number, ahora: Date): Promise<void> {
    await this.db('notificaciones').where({ usuario_id: usuarioId, leida: false }).update({ leida: true, leida_en: ahora });
  }

  async purgarLeidas(antesDe: Date): Promise<number> {
    return this.db('notificaciones').where('leida', true).where('leida_en', '<', antesDe).delete();
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
