import type { Knex } from 'knex';
import type { Permisos } from '../../domain/auth/permisos';
import type { TicketAlcance, UsuarioAlcance } from '../../domain/autorizacion/alcance-tickets';
import type { DestinatariosRepository } from '../../domain/repositories/destinatarios-repository';

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

export class KnexDestinatariosRepository implements DestinatariosRepository {
  constructor(private readonly db: Knex) {}

  async coordinadores(dependenciaId: number): Promise<number[]> {
    const filas: { id: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.activo', true)
      .where('u.dependencia_id', dependenciaId)
      .whereRaw(`r.permisos->>'tickets.ver' = 'dependencia'`)
      .select('u.id');
    return filas.map((fila) => Number(fila.id));
  }

  async supervisores(): Promise<number[]> {
    const filas: { id: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.activo', true)
      .whereRaw(`r.permisos->>'tickets.triage' IS NOT NULL`)
      .select('u.id');
    return filas.map((fila) => Number(fila.id));
  }

  async participantes(ticketId: number): Promise<number[]> {
    const filas: { autor_id: string }[] = await this.db('comentarios as c')
      .join('tickets as t', 't.id', 'c.ticket_id')
      .where('c.ticket_id', ticketId)
      .whereRaw('c.autor_id <> t.solicitante_id')
      .distinct('c.autor_id');
    return filas.map((fila) => Number(fila.autor_id));
  }

  async activos(ids: readonly number[]): Promise<UsuarioAlcance[]> {
    if (ids.length === 0) {
      return [];
    }
    const filas: { id: string; dependencia_id: string | null; permisos: Permisos }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.activo', true)
      .whereIn('u.id', ids as number[])
      .select('u.id', 'u.dependencia_id', 'r.permisos');
    return filas.map((fila) => ({
      id: Number(fila.id),
      dependenciaId: numeroONull(fila.dependencia_id),
      permisos: fila.permisos,
    }));
  }

  async ticket(ticketId: number): Promise<TicketAlcance | null> {
    const fila:
      | { solicitante_id: string; registrado_por: string | null; asignado_a: string | null; dependencia_id: string | null }
      | undefined = await this.db('tickets')
      .where({ id: ticketId })
      .first('solicitante_id', 'registrado_por', 'asignado_a', 'dependencia_id');
    return fila
      ? {
          solicitanteId: Number(fila.solicitante_id),
          registradoPor: numeroONull(fila.registrado_por),
          asignadoA: numeroONull(fila.asignado_a),
          dependenciaId: numeroONull(fila.dependencia_id),
        }
      : null;
  }
}
