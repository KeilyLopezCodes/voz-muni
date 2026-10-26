import { CierreAutomaticoService, TAMANO_LOTE_CIERRE } from '../../../src/application/services/cierre-automatico.service';
import type { CierreAutomaticoRepository } from '../../../src/domain/repositories/cierre-automatico-repository';
import type { TicketEscrituraRepository, TicketParaTransicion } from '../../../src/domain/repositories/ticket-escritura-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket } from '../../../src/domain/ticket/ticket';
import { AuditoriaEnMemoria, correosPendientes, EnviadorEnMemoria, PlantillasEnMemoria } from '../auth/dobles';
import { SLA_VACIO } from './dobles-sla';
import { notificadorDePrueba } from '../notificaciones/dobles-correo';

const AHORA = new Date('2026-11-10T15:00:00.000Z');
const VENCIO = new Date('2026-11-10T05:59:59.999Z');

class CierreEnMemoria implements CierreAutomaticoRepository {
  readonly limites: number[] = [];

  constructor(
    private ids: number[],
    private readonly sinPlazo = 0,
  ) {}

  async reclamarVencidas(_ahora: Date, limite: number): Promise<number[]> {
    this.limites.push(limite);
    const lote = this.ids.slice(0, limite);
    this.ids = this.ids.slice(limite);
    return lote;
  }

  async contarSinPlazo(): Promise<number> {
    return this.sinPlazo;
  }
}

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly guardadas: ResultadoTransicion[] = [];
  readonly estados = new Map<number, EstadoTicket>();

  async obtenerParaActualizar(id: number): Promise<TicketParaTransicion | null> {
    return {
      ticket: Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado: this.estados.get(id) ?? 'resuelta',
        dependenciaId: 4,
        asignadoA: 9,
        prioridad: 'alta',
        escalado: true,
        escaladoEn: VENCIO,
        escaladoPor: 'resolucion',
        resueltoEn: new Date('2026-11-02T15:00:00.000Z'),
        cerradoEn: null,
        resolucion: 'Se rellenó',
        resueltoPor: 9,
        confirmacionVenceEn: VENCIO,
        reaperturas: 0,
      }),
      titulo: 'Bache',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: 7, nombre: 'Ana', email: id === 99 ? null : 'ana@correo.gt' },
      sla: SLA_VACIO,
    };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.guardadas.push(resultado);
  }
}

function montar(ids: number[], sinPlazo = 0) {
  const cierre = new CierreEnMemoria(ids, sinPlazo);
  const tickets = new TicketsEnMemoria();
  let transacciones = 0;
  const auditoria = new AuditoriaEnMemoria();
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => {
      transacciones++;
      return trabajo({ cierreAutomatico: cierre, ticketsEscritura: tickets, auditoria } as unknown as ReposTransaccionales);
    },
  };
  const plantillas = new PlantillasEnMemoria();
  plantillas.plantillas.set('queja_cerrada_automaticamente', {
    clave: 'queja_cerrada_automaticamente',
    asunto: 'Cerrada {{numero}}',
    cuerpoTexto: '{{nombre}} {{titulo}} {{enlace}}',
    cuerpoHtml: '<p>{{nombre}}</p>',
  });
  const enviador = new EnviadorEnMemoria();
  const logs: string[] = [];
  const servicio = new CierreAutomaticoService(
    transaccion,
    cierre,
    notificadorDePrueba(plantillas, enviador, (m) => logs.push(m)),
    'https://vozmuni.test',
    (m) => logs.push(m),
  );
  return { servicio, cierre, tickets, enviador, logs, transacciones: () => transacciones };
}

describe('CierreAutomaticoService', () => {
  it('cierra con el dominio como sistema y avisa al solicitante después del lote', async () => {
    const { servicio, tickets, enviador } = montar([5]);
    expect(await servicio.procesar(AHORA)).toBe(1);

    const [{ ticket, historial }] = tickets.guardadas;
    expect(ticket.estado).toBe('cerrada');
    expect(ticket.cerradoEn).toEqual(AHORA);
    // La marca de escalada no cambia al cerrar (SPEC 32).
    expect(ticket.escalado).toBe(true);
    expect(historial).toMatchObject({ estadoAnterior: 'resuelta', estadoNuevo: 'cerrada', usuarioId: null, motivo: null });

    await correosPendientes();
    expect(enviador.enviados).toEqual([
      expect.objectContaining({ para: 'ana@correo.gt', asunto: 'Cerrada Q-2026-000005', texto: 'Ana Bache https://vozmuni.test/tickets/5' }),
    ]);
  });

  it('salta una queja que ya no está resuelta (el vecino ganó el bloqueo)', async () => {
    const { servicio, tickets, enviador } = montar([5, 6]);
    tickets.estados.set(6, 'cerrada');
    expect(await servicio.procesar(AHORA)).toBe(1);
    expect(tickets.guardadas.map((g) => g.ticket.id)).toEqual([5]);
    await correosPendientes();
    expect(enviador.enviados).toHaveLength(1);
  });

  it('un solicitante sin correo no recibe nada', async () => {
    const { servicio, enviador } = montar([99]);
    expect(await servicio.procesar(AHORA)).toBe(1);
    await correosPendientes();
    expect(enviador.enviados).toEqual([]);
  });

  it('un fallo del enviador no revierte el cierre', async () => {
    const { servicio, tickets, enviador, logs } = montar([5]);
    enviador.fallar = true;
    expect(await servicio.procesar(AHORA)).toBe(1);
    await correosPendientes();
    expect(tickets.guardadas).toHaveLength(1);
    expect(logs).toEqual([expect.stringContaining('queja_cerrada_automaticamente')]);
  });

  it('informa en el log las quejas resueltas sin plazo', async () => {
    const { servicio, logs } = montar([], 3);
    expect(await servicio.procesar(AHORA)).toBe(0);
    expect(logs).toEqual(['Cierre automático: 3 quejas resueltas sin plazo de confirmación no se cierran']);
  });

  it('sin quejas sin plazo no escribe en el log', async () => {
    const { servicio, logs } = montar([]);
    await servicio.procesar(AHORA);
    expect(logs).toEqual([]);
  });

  it(`más de ${TAMANO_LOTE_CIERRE} vencidas se cierran en varios lotes`, async () => {
    const ids = Array.from({ length: TAMANO_LOTE_CIERRE + 2 }, (_, i) => i + 1);
    const { servicio, cierre, transacciones } = montar(ids);
    expect(await servicio.procesar(AHORA)).toBe(TAMANO_LOTE_CIERRE + 2);
    expect(transacciones()).toBe(2);
    expect(cierre.limites).toEqual([TAMANO_LOTE_CIERRE, TAMANO_LOTE_CIERRE]);
  });
});
