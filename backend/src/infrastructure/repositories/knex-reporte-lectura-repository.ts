import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type { ReporteLecturaRepository } from '../../domain/repositories/reporte-lectura-repository';
import { ESTADOS_TICKET, type EstadoTicket } from '../../domain/ticket/estado-ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

function enCero(): Record<EstadoTicket, number> {
  return Object.fromEntries(ESTADOS_TICKET.map((estado) => [estado, 0])) as Record<EstadoTicket, number>;
}

export class KnexReporteLecturaRepository implements ReporteLecturaRepository {
  constructor(private readonly db: Knex) {}

  async contarPorEstado(filtro: FiltroTickets): Promise<Record<EstadoTicket, number>> {
    const conteo = enCero();
    if (filtro === null) {
      return conteo;
    }
    const filas: { estado: EstadoTicket; total: string }[] = await aplicarFiltro(
      this.db('tickets as t'),
      filtro,
      COLUMNAS_TICKET,
      't',
    )
      .select('t.estado')
      .count({ total: '*' })
      .groupBy('t.estado');
    for (const { estado, total } of filas) {
      conteo[estado] = Number(total);
    }
    return conteo;
  }
}
