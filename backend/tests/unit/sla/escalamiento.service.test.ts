import { EscalamientoService, TAMANO_LOTE_ESCALAMIENTO } from '../../../src/application/services/escalamiento.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import type { EscalamientoPendiente, EscalamientoRepository } from '../../../src/domain/repositories/escalamiento-repository';
import type { NotificacionRepository, NuevaNotificacion } from '../../../src/domain/repositories/notificacion-repository';
import type { TicketEscrituraRepository, TicketParaTransicion } from '../../../src/domain/repositories/ticket-escritura-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { Ticket } from '../../../src/domain/ticket/ticket';
import { SLA_VACIO } from './dobles-sla';

const AHORA = new Date('2026-11-02T20:00:00.000Z');
const VENCE = new Date('2026-11-02T18:00:00.000Z');

function ticket(id: number, estado: EstadoTicket = 'en_proceso', escalado = false): Ticket {
  return Ticket.reconstituir({
    id,
    numero: `Q-2026-${String(id).padStart(6, '0')}`,
    estado,
    dependenciaId: 1,
    asignadoA: 10,
    prioridad: 'alta',
    escalado,
    escaladoEn: escalado ? VENCE : null,
    escaladoPor: escalado ? 'respuesta' : null,
    resueltoEn: null,
    cerradoEn: null,
    resolucion: null,
    resueltoPor: null,
    confirmacionVenceEn: null,
    reaperturas: 0,
  });
}

class EscalamientoEnMemoria implements EscalamientoRepository {
  readonly limites: number[] = [];

  constructor(
    private pendientes: EscalamientoPendiente[],
    private readonly ids: number[] = [30],
  ) {}

  async reclamarPendientes(_ahora: Date, limite: number): Promise<EscalamientoPendiente[]> {
    this.limites.push(limite);
    const lote = this.pendientes.slice(0, limite);
    this.pendientes = this.pendientes.slice(limite);
    return lote;
  }

  async supervisores(): Promise<number[]> {
    return this.ids;
  }
}

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarEscalado'> {
  readonly guardados: Ticket[] = [];
  readonly filtros: FiltroTickets[] = [];

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    return {
      ticket: ticket(id),
      titulo: 'Bache',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: 7, nombre: 'Ana', email: null },
      sla: SLA_VACIO,
    };
  }

  async guardarEscalado(t: Ticket): Promise<void> {
    this.guardados.push(t);
  }
}

class NotificacionesEnMemoria implements Pick<NotificacionRepository, 'crear'> {
  readonly creadas: NuevaNotificacion[] = [];

  async crear(notificaciones: readonly NuevaNotificacion[]): Promise<void> {
    this.creadas.push(...notificaciones);
  }
}

function montar(pendientes: EscalamientoPendiente[], supervisores?: number[]) {
  const escalamiento = new EscalamientoEnMemoria(pendientes, supervisores);
  const tickets = new TicketsEnMemoria();
  const notificaciones = new NotificacionesEnMemoria();
  let transacciones = 0;
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => {
      transacciones++;
      return trabajo({ escalamiento, ticketsEscritura: tickets, notificaciones } as unknown as ReposTransaccionales);
    },
  };
  const logs: string[] = [];
  const servicio = new EscalamientoService(transaccion, (m) => logs.push(m));
  return { servicio, escalamiento, tickets, notificaciones, logs, transacciones: () => transacciones };
}

describe('EscalamientoService', () => {
  it('marca cada queja con el dominio (fecha y plazo) y notifica a cada supervisor', async () => {
    const { servicio, tickets, notificaciones } = montar(
      [
        { ticketId: 5, plazo: 'respuesta', vence: VENCE },
        { ticketId: 6, plazo: 'resolucion', vence: VENCE },
      ],
      [30, 31],
    );
    expect(await servicio.procesar(AHORA)).toBe(2);
    expect(tickets.guardados.map((t) => [t.id, t.escalado, t.escaladoEn, t.escaladoPor])).toEqual([
      [5, true, AHORA, 'respuesta'],
      [6, true, AHORA, 'resolucion'],
    ]);
    // El job no actúa en nombre de un usuario: sin filtro de alcance.
    expect(tickets.filtros).toEqual([[], []]);
    expect(notificaciones.creadas).toEqual([
      { usuarioId: 30, ticketId: 5, tipo: 'sla_escalamiento', datos: { plazo: 'respuesta', vence: VENCE.toISOString() }, creadoEn: AHORA },
      { usuarioId: 31, ticketId: 5, tipo: 'sla_escalamiento', datos: { plazo: 'respuesta', vence: VENCE.toISOString() }, creadoEn: AHORA },
      { usuarioId: 30, ticketId: 6, tipo: 'sla_escalamiento', datos: { plazo: 'resolucion', vence: VENCE.toISOString() }, creadoEn: AHORA },
      { usuarioId: 31, ticketId: 6, tipo: 'sla_escalamiento', datos: { plazo: 'resolucion', vence: VENCE.toISOString() }, creadoEn: AHORA },
    ]);
  });

  it('sin supervisores activos escala igual y deja un aviso en el log', async () => {
    const { servicio, tickets, notificaciones, logs } = montar([{ ticketId: 5, plazo: 'respuesta', vence: VENCE }], []);
    expect(await servicio.procesar(AHORA)).toBe(1);
    expect(tickets.guardados).toHaveLength(1);
    expect(notificaciones.creadas).toEqual([]);
    expect(logs).toEqual([expect.stringContaining('ticket 5')]);
  });

  it(`procesa más de ${TAMANO_LOTE_ESCALAMIENTO} pendientes en varios lotes`, async () => {
    const pendientes = Array.from({ length: TAMANO_LOTE_ESCALAMIENTO + 3 }, (_, i) => ({
      ticketId: i + 1,
      plazo: 'resolucion' as const,
      vence: VENCE,
    }));
    const { servicio, escalamiento, transacciones } = montar(pendientes);
    expect(await servicio.procesar(AHORA)).toBe(TAMANO_LOTE_ESCALAMIENTO + 3);
    expect(transacciones()).toBe(2);
    expect(escalamiento.limites).toEqual([TAMANO_LOTE_ESCALAMIENTO, TAMANO_LOTE_ESCALAMIENTO]);
  });

  it('sin pendientes no hace nada', async () => {
    const { servicio, notificaciones } = montar([]);
    expect(await servicio.procesar(AHORA)).toBe(0);
    expect(notificaciones.creadas).toEqual([]);
  });

  it('la marca de una queja ya escalada conserva la fecha y el plazo originales', () => {
    const escalada = ticket(5, 'en_proceso', true);
    expect(escalada.marcarEscalado(AHORA, 'resolucion')).toBe(escalada);
  });
});
