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

  async agruparComentario(usuarioId: number, ticketId: number, interno: boolean, ahora: Date): Promise<void> {
    // El conflicto lo detecta notificaciones_comentario_sin_leer_uq (0031): dos comentarios simultáneos suman, no
    // crean dos filas.
    await this.db.raw(
      `INSERT INTO notificaciones (usuario_id, ticket_id, tipo, datos, creado_en)
       VALUES (:usuarioId, :ticketId, 'comentario_nuevo',
               jsonb_build_object('cantidad', 1, 'incluyeInternas', :interno::boolean), :ahora)
       ON CONFLICT (usuario_id, ticket_id) WHERE tipo = 'comentario_nuevo' AND NOT leida DO UPDATE SET
         datos = jsonb_build_object(
           'cantidad', (notificaciones.datos ->> 'cantidad')::int + 1,
           'incluyeInternas', (notificaciones.datos ->> 'incluyeInternas')::boolean OR :interno::boolean
         ),
         creado_en = EXCLUDED.creado_en`,
      { usuarioId, ticketId, interno, ahora },
    );
  }

  async purgarLeidas(leidasAntesDe: Date): Promise<number> {
    // Usa notificaciones_leidas_idx (0031). Las no leídas nunca se borran.
    return this.db('notificaciones').where('leida', true).where('leida_en', '<', leidasAntesDe).delete();
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

  async marcarLeida(usuarioId: number, id: number, ahora: Date): Promise<NotificacionLeida | null> {
    const actualizadas = await this.db('notificaciones')
      .where({ id, usuario_id: usuarioId })
      .update({ leida: true, leida_en: this.db.raw('COALESCE(leida_en, ?)', [ahora]) });
    if (actualizadas === 0) {
      return null;
    }
    const fila: FilaNotificacion | undefined = await this.consulta().where('n.id', id).first();
    return fila ? aNotificacion(fila) : null;
  }

  async marcarTodasLeidas(usuarioId: number, ahora: Date): Promise<void> {
    await this.db('notificaciones')
      .where({ usuario_id: usuarioId, leida: false })
      .update({ leida: true, leida_en: ahora });
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
