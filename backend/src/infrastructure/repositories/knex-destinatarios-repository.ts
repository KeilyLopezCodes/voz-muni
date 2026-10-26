import type { Knex } from 'knex';
import type { Permisos } from '../../domain/auth/permisos';
import type { TicketAlcance } from '../../domain/autorizacion/alcance-tickets';
import {
  ACCION_SUPERVISION,
  ALCANCE_COORDINACION,
  type DestinatariosRepository,
  type UsuarioDestino,
} from '../../domain/repositories/destinatarios-repository';

// pg devuelve los bigint como string.
const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

export class KnexDestinatariosRepository implements DestinatariosRepository {
  constructor(private readonly db: Knex) {}

  async coordinadores(dependenciaId: number): Promise<number[]> {
    const filas: { id: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where({ 'u.activo': true, 'u.dependencia_id': dependenciaId })
      .whereRaw(`r.permisos ->> 'tickets.ver' = ?`, [ALCANCE_COORDINACION])
      .orderBy('u.id')
      .select('u.id');
    return filas.map((fila) => Number(fila.id));
  }

  async supervisores(): Promise<number[]> {
    const filas: { id: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.activo', true)
      .whereRaw('(r.permisos ->> ?) IS NOT NULL', [ACCION_SUPERVISION])
      .orderBy('u.id')
      .select('u.id');
    return filas.map((fila) => Number(fila.id));
  }

  async participantes(ticketId: number): Promise<number[]> {
    const filas: { autor_id: string }[] = await this.db('comentarios as c')
      .join('tickets as t', 't.id', 'c.ticket_id')
      .where('c.ticket_id', ticketId)
      .whereRaw('c.autor_id <> t.solicitante_id')
      .distinct('c.autor_id')
      .orderBy('c.autor_id');
    return filas.map((fila) => Number(fila.autor_id));
  }

  async usuarios(ids: readonly number[]): Promise<UsuarioDestino[]> {
    if (ids.length === 0) {
      return [];
    }
    const filas: { id: string; activo: boolean; dependencia_id: string | null; permisos: Permisos }[] = await this.db(
      'usuarios as u',
    )
      .join('roles as r', 'r.id', 'u.rol_id')
      .whereIn('u.id', ids)
      .orderBy('u.id')
      .select('u.id', 'u.activo', 'u.dependencia_id', 'r.permisos');
    return filas.map((fila) => ({
      id: Number(fila.id),
      activo: fila.activo,
      dependenciaId: numeroONull(fila.dependencia_id),
      permisos: fila.permisos,
    }));
  }

  async alcanceTicket(ticketId: number): Promise<TicketAlcance | null> {
    const fila:
      | { solicitante_id: string; registrado_por: string | null; asignado_a: string | null; dependencia_id: string | null }
      | undefined = await this.db('tickets')
      .where({ id: ticketId })
      .first('solicitante_id', 'registrado_por', 'asignado_a', 'dependencia_id');
    if (!fila) {
      return null;
    }
    return {
      solicitanteId: Number(fila.solicitante_id),
      registradoPor: numeroONull(fila.registrado_por),
      asignadoA: numeroONull(fila.asignado_a),
      dependenciaId: numeroONull(fila.dependencia_id),
    };
  }
}
