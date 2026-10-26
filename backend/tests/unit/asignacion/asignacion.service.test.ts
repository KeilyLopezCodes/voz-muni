import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { AsignacionService } from '../../../src/application/services/asignacion.service';
import type { RegistroAsignacion, TecnicoCandidato } from '../../../src/domain/asignacion/asignacion-tecnico';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import {
  type AsignacionRepository,
  ESTADOS_ABIERTOS,
  type TecnicoConCarga,
} from '../../../src/domain/repositories/asignacion-repository';
import type {
  PorAsignarLecturaRepository,
  TicketPorAsignar,
  VistaPorAsignar,
} from '../../../src/domain/repositories/por-asignar-lectura-repository';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { Ticket } from '../../../src/domain/ticket/ticket';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';
import { SLA_VACIO } from '../sla/dobles-sla';

const AHORA = new Date('2026-10-23T15:00:00.000Z');
const OBRAS = 4;

const COORDINADOR: UsuarioAutenticado = {
  id: 40,
  nombre: 'Carlos Coordinador',
  rol: 'coordinador',
  dependenciaId: OBRAS,
  permisos: { 'tickets.ver': 'dependencia', 'tickets.asignar': 'dependencia' },
};

const SUPERVISOR: UsuarioAutenticado = {
  id: 50,
  nombre: 'Sara Supervisora',
  rol: 'supervisor',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'todas', 'tickets.asignar': 'todas' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTecnico'> {
  readonly tickets = new Map<number, Ticket>();
  readonly filtros: FiltroTickets[] = [];

  agregar(id: number, estado: EstadoTicket, asignadoA: number | null = null, dependenciaId = OBRAS): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId,
        asignadoA,
        prioridad: 'media',
        escalado: false,
        resueltoEn: null,
        cerradoEn: null,
        resolucion: null,
        resueltoPor: null,
        confirmacionVenceEn: null,
        reaperturas: 0,
      }),
    );
  }

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    const ticket = this.tickets.get(id);
    // Como el WHERE del repositorio real: las condiciones de dependencia filtran.
    if (!ticket || filtro === null || filtro.some((c) => c.campo === 'dependenciaId' && c.valor !== ticket.dependenciaId)) {
      return null;
    }
    return {
      ticket,
      titulo: 'Bache',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: 7, nombre: 'Ana', email: null },
      sla: SLA_VACIO,
    };
  }

  async guardarTecnico(ticket: Ticket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
  }
}

class AsignacionesEnMemoria implements AsignacionRepository {
  readonly registros: RegistroAsignacion[] = [];
  readonly usuarios: TecnicoCandidato[] = [
    { id: 9, rol: 'tecnico', activo: true, dependenciaId: OBRAS },
    { id: 10, rol: 'tecnico', activo: true, dependenciaId: OBRAS },
    { id: 11, rol: 'tecnico', activo: true, dependenciaId: 5 },
  ];

  constructor(private readonly tickets: TicketsEnMemoria) {}

  async obtenerCandidato(usuarioId: number): Promise<TecnicoCandidato | null> {
    return this.usuarios.find((u) => u.id === usuarioId) ?? null;
  }

  async registrar(registro: RegistroAsignacion): Promise<void> {
    this.registros.push(registro);
  }

  // Carga como el repositorio real: solo los estados abiertos.
  async tecnicosConCarga(dependenciaId: number): Promise<TecnicoConCarga[]> {
    const abiertos = ESTADOS_ABIERTOS as readonly EstadoTicket[];
    return this.usuarios
      .filter((u) => u.rol === 'tecnico' && u.activo && u.dependenciaId === dependenciaId)
      .map((u) => ({
        id: u.id,
        nombre: `Técnico ${u.id}`,
        carga: [...this.tickets.tickets.values()].filter((t) => t.asignadoA === u.id && abiertos.includes(t.estado)).length,
      }))
      .sort((a, b) => a.carga - b.carga);
  }
}

class BandejaFalsa implements PorAsignarLecturaRepository {
  readonly llamadas: { filtro: FiltroTickets; vista: VistaPorAsignar }[] = [];

  async listar(filtro: FiltroTickets, vista: VistaPorAsignar, pagina: number, tamano: number) {
    this.llamadas.push({ filtro, vista });
    const ticket: TicketPorAsignar = {
      id: 1,
      numero: 'Q-2026-000001',
      estado: 'asignada',
      prioridad: 'alta',
      titulo: 'Bache',
      categoria: { id: 1, nombre: 'Baches' },
      dependencia: { id: OBRAS, nombre: 'Obras' },
      zona: { id: 1, nombre: 'Zona 1', tipo: 'zona' },
      tecnico: null,
      creadoEn: AHORA,
      sla: { venceRespuesta: AHORA, primeraRespuestaEn: null, venceResolucion: null, restanteMinutosEnPausa: null },
    };
    return { datos: [ticket], pagina, tamano, total: 1 };
  }
}

function armar() {
  const tickets = new TicketsEnMemoria();
  const asignaciones = new AsignacionesEnMemoria(tickets);
  const bandeja = new BandejaFalsa();
  const servicio = new AsignacionService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository, asignaciones }),
    bandeja,
    new RelojFalso(AHORA),
  );
  return { tickets, asignaciones, bandeja, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('AsignacionService', () => {
  it('la primera asignación guarda asignado_a y una fila con tecnico_anterior null', async () => {
    const { tickets, asignaciones, servicio } = armar();
    tickets.agregar(1, 'asignada');

    const respuesta = await servicio.asignar(COORDINADOR, 1, { tecnicoId: 9 });

    expect(respuesta).toEqual({ id: 1, numero: 'Q-2026-000001', estado: 'asignada', asignadoA: 9, tecnicoAnterior: null });
    expect(tickets.tickets.get(1)!.asignadoA).toBe(9);
    expect(asignaciones.registros).toEqual([
      { ticketId: 1, tecnicoAnterior: null, tecnicoNuevo: 9, asignadoPor: 40, motivo: null, creadoEn: AHORA },
    ]);
    expect(tickets.filtros).toEqual([[{ campo: 'dependenciaId', valor: OBRAS }, { campo: 'dependenciaId', valor: OBRAS }]]);
  });

  it('la reasignación guarda el técnico anterior y el motivo recortado', async () => {
    const { tickets, asignaciones, servicio } = armar();
    tickets.agregar(1, 'asignada', 9);

    const respuesta = await servicio.asignar(COORDINADOR, 1, { tecnicoId: 10, motivo: '  Vacaciones ' });

    expect(respuesta).toMatchObject({ asignadoA: 10, tecnicoAnterior: 9 });
    expect(asignaciones.registros[0]).toMatchObject({ tecnicoAnterior: 9, tecnicoNuevo: 10, motivo: 'Vacaciones' });
  });

  it('en en_proceso el estado no cambia', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso', 9);

    const respuesta = await servicio.asignar(SUPERVISOR, 1, { tecnicoId: 10, motivo: 'Carga alta' });

    expect(respuesta.estado).toBe('en_proceso');
    expect(tickets.tickets.get(1)!.estado).toBe('en_proceso');
  });

  it('en resuelta lanza OPERACION_NO_PERMITIDA y no registra nada', async () => {
    const { tickets, asignaciones, servicio } = armar();
    tickets.agregar(1, 'resuelta');

    expect(await capturar(servicio.asignar(SUPERVISOR, 1, { tecnicoId: 9 }))).toMatchObject({
      codigo: 'OPERACION_NO_PERMITIDA',
    });
    expect(asignaciones.registros).toEqual([]);
  });

  it('reasignar sin motivo lanza MOTIVO_REQUERIDO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 9);

    expect(await capturar(servicio.asignar(COORDINADOR, 1, { tecnicoId: 10 }))).toMatchObject({ codigo: 'MOTIVO_REQUERIDO' });
  });

  it.each([
    ['un técnico de otra dependencia', 11, 'TECNICO_NO_ELEGIBLE'],
    ['un usuario inexistente', 999, 'TECNICO_NO_ELEGIBLE'],
  ])('%s → %s como ErrorDeAplicacion', async (_caso, tecnicoId, codigo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');

    const error = await capturar(servicio.asignar(COORDINADOR, 1, { tecnicoId }));

    expect(error).toMatchObject({ name: 'ErrorDeAplicacion', codigo });
  });

  it('el mismo técnico → TECNICO_SIN_CAMBIO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 9);

    expect(await capturar(servicio.asignar(COORDINADOR, 1, { tecnicoId: 9, motivo: 'x' }))).toMatchObject({
      codigo: 'TECNICO_SIN_CAMBIO',
    });
  });

  it('una queja de otra dependencia, para el coordinador → NO_ENCONTRADO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', null, 5);

    expect(await capturar(servicio.asignar(COORDINADOR, 1, { tecnicoId: 11 }))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('la carga cuenta solo asignada, en_proceso y en_espera', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 9);
    tickets.agregar(2, 'en_proceso', 9);
    tickets.agregar(3, 'en_espera', 9);
    tickets.agregar(4, 'resuelta', 9);
    tickets.agregar(5, 'cerrada', 10);

    expect(await servicio.tecnicos(COORDINADOR, OBRAS)).toEqual([
      { id: 10, nombre: 'Técnico 10', carga: 0 },
      { id: 9, nombre: 'Técnico 9', carga: 3 },
    ]);
  });

  it('el coordinador que pide otra dependencia recibe NO_ENCONTRADO; el supervisor puede pedir cualquiera', async () => {
    const { servicio } = armar();

    expect(await capturar(servicio.tecnicos(COORDINADOR, 5))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(await servicio.tecnicos(SUPERVISOR, 5)).toEqual([{ id: 11, nombre: 'Técnico 11', carga: 0 }]);
  });

  it('listarPorAsignar usa el filtro de tickets.asignar y devuelve creadoEn en ISO', async () => {
    const { bandeja, servicio } = armar();

    const pagina = await servicio.listarPorAsignar(COORDINADOR, 'abiertas', 1, 20);

    expect(bandeja.llamadas[0].vista).toBe('abiertas');
    expect(bandeja.llamadas[0].filtro).toEqual([
      { campo: 'dependenciaId', valor: OBRAS },
      { campo: 'dependenciaId', valor: OBRAS },
    ]);
    expect(pagina.datos[0].creadoEn).toBe('2026-10-23T15:00:00.000Z');
  });
});
