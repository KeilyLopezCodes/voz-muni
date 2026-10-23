import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type { Pagina, TicketLecturaRepository, TicketResumen } from '../../domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

// pg devuelve los bigint como string.
interface FilaTicket {
  id: string;
  numero: string;
  estado: EstadoTicket;
  creado_en: Date;
  solicitante_id: string;
  registrado_por: string | null;
  asignado_a: string | null;
  dependencia_id: string | null;
}

const COLUMNAS = [
  't.id',
  't.numero',
  't.estado',
  't.creado_en',
  't.solicitante_id',
  't.registrado_por',
  't.asignado_a',
  't.dependencia_id',
];

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

function aResumen(fila: FilaTicket): TicketResumen {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    solicitanteId: Number(fila.solicitante_id),
    registradoPor: numeroONull(fila.registrado_por),
    asignadoA: numeroONull(fila.asignado_a),
    dependenciaId: numeroONull(fila.dependencia_id),
  };
}

export class KnexTicketLecturaRepository implements TicketLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarFiltro(this.db('tickets as t'), filtro, COLUMNAS_TICKET, 't');
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaTicket[] = await consulta
      .select(COLUMNAS)
      .orderBy([
        { column: 't.creado_en', order: 'desc' },
        { column: 't.id', order: 'desc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aResumen), pagina, tamano, total: Number(total) };
  }

  async obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null> {
    if (filtro === null) {
      return null;
    }
    const fila: FilaTicket | undefined = await aplicarFiltro(
      this.db('tickets as t').where('t.id', id),
      filtro,
      COLUMNAS_TICKET,
      't',
    ).first(COLUMNAS);
    return fila ? aResumen(fila) : null;
  }
}
