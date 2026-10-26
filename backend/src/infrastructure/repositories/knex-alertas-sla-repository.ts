import type { Knex } from 'knex';
import {
  ALCANCE_COORDINACION,
  type AlertaPendiente,
  type AlertasSlaRepository,
  type PlazoAlerta,
} from '../../domain/repositories/alertas-sla-repository';

// Solo se alertan las quejas que corren: ni en revisión (por ejemplo, tras un traslado), ni en espera, ni resueltas.
const ESTADOS_ALERTABLES = ['asignada', 'en_proceso'];

// Columnas fijas por plazo: ningún nombre de columna sale de la entrada.
const COLUMNAS: Readonly<Record<PlazoAlerta, { alerta: string; enviada: string; vence: string }>> = {
  respuesta: { alerta: 'alerta_respuesta_en', enviada: 'alerta_respuesta_enviada_en', vence: 'vence_respuesta' },
  resolucion: { alerta: 'alerta_resolucion_en', enviada: 'alerta_resolucion_enviada_en', vence: 'vence_resolucion' },
};

interface FilaAlerta {
  id: string;
  vence: Date;
  dependencia_id: string;
  asignado_a: string | null;
}

export class KnexAlertasSlaRepository implements AlertasSlaRepository {
  constructor(private readonly db: Knex) {}

  async reclamarPendientes(ahora: Date, limite: number): Promise<AlertaPendiente[]> {
    const respuesta = await this.reclamar('respuesta', ahora, limite);
    const resolucion = respuesta.length < limite ? await this.reclamar('resolucion', ahora, limite - respuesta.length) : [];
    return [...respuesta, ...resolucion];
  }

  async marcarEnviada(ticketId: number, plazo: PlazoAlerta, ahora: Date): Promise<void> {
    await this.db('tickets').where({ id: ticketId }).update({ [COLUMNAS[plazo].enviada]: ahora });
  }

  async destinatarios(alerta: AlertaPendiente): Promise<number[]> {
    const coordinadores: { id: string }[] = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where({ 'u.activo': true, 'u.dependencia_id': alerta.dependenciaId })
      .whereRaw(`r.permisos ->> 'tickets.ver' = ?`, [ALCANCE_COORDINACION])
      .orderBy('u.id')
      .select('u.id');
    const ids = coordinadores.map((fila) => Number(fila.id));
    if (alerta.asignadoA !== null && !ids.includes(alerta.asignadoA)) {
      const tecnico = await this.db('usuarios').where({ id: alerta.asignadoA, activo: true }).first('id');
      if (tecnico) {
        ids.unshift(alerta.asignadoA);
      }
    }
    return ids;
  }

  private async reclamar(plazo: PlazoAlerta, ahora: Date, limite: number): Promise<AlertaPendiente[]> {
    const columnas = COLUMNAS[plazo];
    const consulta = this.db('tickets')
      .where(columnas.alerta, '<=', ahora)
      .whereNull(columnas.enviada)
      .whereIn('estado', ESTADOS_ALERTABLES);
    // La alerta de respuesta deja de tener sentido cuando ya hubo primera respuesta.
    if (plazo === 'respuesta') {
      consulta.whereNull('primera_respuesta_en');
    }
    const filas: FilaAlerta[] = await consulta
      .orderBy([{ column: columnas.alerta }, { column: 'id' }])
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select('id', `${columnas.vence} as vence`, 'dependencia_id', 'asignado_a');
    return filas.map((fila) => ({
      ticketId: Number(fila.id),
      plazo,
      vence: fila.vence,
      dependenciaId: Number(fila.dependencia_id),
      asignadoA: fila.asignado_a === null ? null : Number(fila.asignado_a),
    }));
  }
}
