import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { AtencionService } from '../../../src/application/services/atencion.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type {
  AtencionLecturaRepository,
  EstadoAtencion,
} from '../../../src/domain/repositories/atencion-lectura-repository';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket } from '../../../src/domain/ticket/ticket';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';

const AHORA = new Date('2026-10-23T15:00:00.000Z');

const TECNICO: UsuarioAutenticado = {
  id: 30,
  nombre: 'Luis Técnico',
  rol: 'tecnico',
  dependenciaId: 4,
  permisos: { 'tickets.ver': 'asignadas', 'tickets.cambiar_estado': 'asignadas' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly tickets = new Map<number, Ticket>();
  readonly guardadas: ResultadoTransicion[] = [];
  readonly filtros: FiltroTickets[] = [];

  agregar(id: number, estado: EstadoTicket, asignadoA: number | null = 30): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: 4,
        asignadoA,
        prioridad: 'media',
        escalado: false,
        resueltoEn: null,
        cerradoEn: null,
        resolucion: null,
        resueltoPor: null,
      }),
    );
  }

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    const ticket = this.tickets.get(id);
    if (!ticket || filtro === null || filtro.some((c) => c.campo === 'asignadoA' && c.valor !== ticket.asignadoA)) {
      return null;
    }
    return { ticket, titulo: 'Bache', categoria: { id: 1, nombre: 'Baches' }, solicitante: { id: 7, nombre: 'Ana', email: null } };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.guardadas.push(resultado);
    this.tickets.set(resultado.ticket.id, resultado.ticket);
  }
}

class BandejaFalsa implements AtencionLecturaRepository {
  readonly llamadas: { filtro: FiltroTickets; estados: readonly EstadoAtencion[] }[] = [];

  async listar(filtro: FiltroTickets, estados: readonly EstadoAtencion[], pagina: number, tamano: number) {
    this.llamadas.push({ filtro, estados });
    return { datos: [], pagina, tamano, total: 0 };
  }
}

function armar() {
  const tickets = new TicketsEnMemoria();
  const bandeja = new BandejaFalsa();
  const servicio = new AtencionService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository }),
    bandeja,
    new RelojFalso(AHORA),
  );
  return { tickets, bandeja, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('AtencionService', () => {
  it('iniciar con técnico pasa a en_proceso y escribe el historial del técnico', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');

    const respuesta = await servicio.transicionar(TECNICO, 1, { accion: 'iniciar' });

    expect(respuesta).toEqual({ id: 1, numero: 'Q-2026-000001', estado: 'en_proceso', asignadoA: 30, resueltoEn: null });
    expect(tickets.guardadas[0].historial).toMatchObject({
      estadoAnterior: 'asignada',
      estadoNuevo: 'en_proceso',
      usuarioId: 30,
      motivo: null,
      creadoEn: AHORA,
    });
    expect(tickets.filtros).toEqual([[{ campo: 'asignadoA', valor: 30 }, { campo: 'asignadoA', valor: 30 }]]);
  });

  it('iniciar sin técnico lanza TECNICO_REQUERIDO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', null);
    const supervisor: UsuarioAutenticado = {
      ...TECNICO,
      id: 50,
      rol: 'supervisor',
      permisos: { 'tickets.ver': 'todas', 'tickets.cambiar_estado': 'todas' },
    };

    const error = await capturar(servicio.transicionar(supervisor, 1, { accion: 'iniciar' }));

    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect(error).toMatchObject({ codigo: 'TECNICO_REQUERIDO' });
  });

  it.each(['', '   '])('poner_en_espera con el motivo %p lanza MOTIVO_REQUERIDO', async (motivo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'poner_en_espera', motivo }))).toMatchObject({
      codigo: 'MOTIVO_REQUERIDO',
    });
  });

  it('poner_en_espera guarda el motivo recortado y reanudar vuelve a en_proceso', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const espera = await servicio.transicionar(TECNICO, 1, { accion: 'poner_en_espera', motivo: '  Foto del poste  ' });
    expect(espera.estado).toBe('en_espera');
    expect(tickets.guardadas[0].historial.motivo).toBe('Foto del poste');

    expect((await servicio.transicionar(TECNICO, 1, { accion: 'reanudar' })).estado).toBe('en_proceso');
  });

  it.each(['', '   '])('resolver con la descripción %p lanza DESCRIPCION_REQUERIDA', async (descripcion) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion }))).toMatchObject({
      codigo: 'DESCRIPCION_REQUERIDA',
    });
  });

  it('resolver fija resueltoEn y guarda la descripción recortada en el historial', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const respuesta = await servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion: ' Se cambió la lámpara ' });

    expect(respuesta).toMatchObject({ estado: 'resuelta', resueltoEn: AHORA.toISOString() });
    expect(tickets.guardadas[0].historial).toMatchObject({ estadoNuevo: 'resuelta', motivo: 'Se cambió la lámpara' });
  });

  it.each<[EstadoTicket, Parameters<AtencionService['transicionar']>[2]]>([
    ['en_proceso', { accion: 'iniciar' }],
    ['asignada', { accion: 'poner_en_espera', motivo: 'x' }],
    ['en_proceso', { accion: 'reanudar' }],
    ['en_espera', { accion: 'resolver', descripcion: 'x' }],
  ])('desde %s, %o lanza InvalidTransitionError', async (estado, comando) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, estado);

    expect(await capturar(servicio.transicionar(TECNICO, 1, comando))).toBeInstanceOf(InvalidTransitionError);
    expect(tickets.guardadas).toEqual([]);
  });

  it('un ticket no asignado al técnico → NO_ENCONTRADO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 99);

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'iniciar' }))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('listar usa el filtro de tickets.cambiar_estado', async () => {
    const { bandeja, servicio } = armar();

    await servicio.listar(TECNICO, ['en_espera'], 1, 20);

    expect(bandeja.llamadas).toEqual([
      { filtro: [{ campo: 'asignadoA', valor: 30 }, { campo: 'asignadoA', valor: 30 }], estados: ['en_espera'] },
    ]);
  });
});
