import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { TrasladosService } from '../../../src/application/services/traslados.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import type { CatalogoLecturaRepository } from '../../../src/domain/repositories/catalogo-lectura-repository';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type {
  NuevaSolicitudTraslado,
  Resolucion,
  SolicitudBloqueada,
  SolicitudTraslado,
  TrasladoRepository,
} from '../../../src/domain/repositories/traslado-repository';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket } from '../../../src/domain/ticket/ticket';
import type { EstadoSolicitud } from '../../../src/domain/traslado/solicitud-traslado';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';
import { SLA_VACIO } from '../sla/dobles-sla';

const AHORA = new Date('2026-10-23T15:00:00.000Z');
const OBRAS = 4;
const AGUA = 5;

const TECNICO: UsuarioAutenticado = {
  id: 30,
  nombre: 'Luis Técnico',
  rol: 'tecnico',
  dependenciaId: OBRAS,
  permisos: { 'tickets.ver': 'asignadas', 'tickets.trasladar': 'solicitar' },
};

const SUPERVISOR: UsuarioAutenticado = {
  id: 50,
  nombre: 'Sara Supervisora',
  rol: 'supervisor',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'todas', 'tickets.trasladar': 'todas' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly tickets = new Map<number, Ticket>();
  readonly transiciones: ResultadoTransicion[] = [];

  agregar(id: number, estado: EstadoTicket, asignadoA: number | null = 30): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: OBRAS,
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

  // Como el WHERE del repositorio real: las condiciones de asignado_a filtran.
  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    const ticket = this.tickets.get(id);
    if (!ticket || filtro === null || filtro.some((c) => c.campo === 'asignadoA' && c.valor !== ticket.asignadoA)) {
      return null;
    }
    return { ticket, titulo: 'Bache', categoria: { id: 1, nombre: 'Baches' }, solicitante: { id: 7, nombre: 'Ana', email: null }, sla: SLA_VACIO };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.transiciones.push(resultado);
    this.tickets.set(resultado.ticket.id, resultado.ticket);
  }
}

interface FilaFalsa extends NuevaSolicitudTraslado {
  id: number;
  estado: EstadoSolicitud;
  resolucionFinal: Resolucion | null;
}

class TrasladosEnMemoria implements TrasladoRepository {
  readonly filas: FilaFalsa[] = [];

  async crear(solicitud: NuevaSolicitudTraslado): Promise<number> {
    if (!solicitud.resolucion && this.filas.some((f) => f.ticketId === solicitud.ticketId && f.estado === 'pendiente')) {
      throw new ReglaDeNegocioError('TRASLADO_PENDIENTE', 'pendiente');
    }
    const id = this.filas.length + 1;
    this.filas.push({ ...solicitud, id, estado: solicitud.resolucion?.estado ?? 'pendiente', resolucionFinal: null });
    return id;
  }

  async obtenerParaActualizar(id: number): Promise<SolicitudBloqueada | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila
      ? { id, ticketId: fila.ticketId, estado: fila.estado, motivo: fila.motivo, solicitadoPor: fila.solicitadoPor }
      : null;
  }

  async resolver(id: number, resolucion: Resolucion): Promise<void> {
    const fila = this.filas.find((f) => f.id === id)!;
    fila.estado = resolucion.estado;
    fila.resolucionFinal = resolucion;
  }

  async obtener(id: number): Promise<SolicitudTraslado | null> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) return null;
    return {
      id,
      estado: fila.estado,
      motivo: fila.motivo,
      ticket: { id: fila.ticketId, numero: 'Q', titulo: 'Bache', estado: 'asignada' },
      dependenciaOrigen: { id: fila.dependenciaOrigenId, nombre: 'Obras' },
      dependenciaSugerida: fila.dependenciaSugeridaId ? { id: fila.dependenciaSugeridaId, nombre: 'Agua' } : null,
      solicitadoPor: { id: fila.solicitadoPor, nombre: 'X', rol: 'tecnico' },
      resueltoPor: null,
      motivoResolucion: fila.resolucionFinal?.motivoResolucion ?? null,
      creadoEn: AHORA,
      resueltoEn: fila.resolucionFinal?.resueltoEn ?? null,
    };
  }

  async listar() {
    return { datos: [], pagina: 1, tamano: 20, total: 0 };
  }

  async dependenciaActiva(dependenciaId: number): Promise<boolean> {
    return dependenciaId === AGUA;
  }
}

function armar() {
  const tickets = new TicketsEnMemoria();
  const traslados = new TrasladosEnMemoria();
  const servicio = new TrasladosService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository, traslados }),
    { listarDependenciasActivas: async () => [{ id: AGUA, nombre: 'Agua' }] } as unknown as CatalogoLecturaRepository,
    new RelojFalso(AHORA),
  );
  return { tickets, traslados, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('TrasladosService', () => {
  it('el técnico crea una pendiente con la dependencia de origen y la queja no cambia', async () => {
    const { tickets, traslados, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const respuesta = await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: '  Es de Agua ', dependenciaSugeridaId: AGUA });

    expect(respuesta.ticket).toBeUndefined();
    expect(respuesta.solicitud).toMatchObject({ estado: 'pendiente', motivo: 'Es de Agua', creadoEn: AHORA.toISOString() });
    expect(traslados.filas[0]).toMatchObject({ ticketId: 1, solicitadoPor: 30, dependenciaOrigenId: OBRAS, dependenciaSugeridaId: AGUA });
    expect(tickets.transiciones).toEqual([]);
    expect(tickets.tickets.get(1)!.estado).toBe('en_proceso');
  });

  it('el técnico sobre una queja que no tiene asignada → NO_ENCONTRADO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 99);

    expect(await capturar(servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' }))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('una sugerida inactiva o inexistente → DEPENDENCIA_INVALIDA; igual a la de origen también', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');

    expect(await capturar(servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x', dependenciaSugeridaId: 77 }))).toMatchObject({
      codigo: 'DEPENDENCIA_INVALIDA',
    });
    expect(await capturar(servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x', dependenciaSugeridaId: OBRAS }))).toMatchObject({
      codigo: 'DEPENDENCIA_INVALIDA',
    });
  });

  it('desde un estado que no es asignada ni en_proceso → InvalidTransitionError', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_espera');

    expect(await capturar(servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' }))).toBeInstanceOf(InvalidTransitionError);
  });

  it('el supervisor traslada directo: en_revision sin dependencia ni técnico, y la solicitud aprobada a su nombre', async () => {
    const { tickets, traslados, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const respuesta = await servicio.solicitar(SUPERVISOR, 'todas', 1, { motivo: 'Corresponde a Agua' });

    expect(respuesta.ticket).toEqual({ id: 1, numero: 'Q-2026-000001', estado: 'en_revision' });
    const ticket = tickets.tickets.get(1)!;
    expect([ticket.estado, ticket.dependenciaId, ticket.asignadoA]).toEqual(['en_revision', null, null]);
    expect(tickets.transiciones[0].historial).toMatchObject({ usuarioId: 50, motivo: 'Corresponde a Agua' });
    expect(traslados.filas[0]).toMatchObject({
      estado: 'aprobada',
      solicitadoPor: 50,
      resolucion: { estado: 'aprobada', resueltoPor: 50, resueltoEn: AHORA },
    });
  });

  it('aprobar aplica trasladar con el motivo de la solicitud', async () => {
    const { tickets, traslados, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'Es de Agua' });

    const respuesta = await servicio.aprobar(SUPERVISOR, 1);

    expect(respuesta.ticket?.estado).toBe('en_revision');
    expect(tickets.transiciones[0].historial).toMatchObject({ estadoAnterior: 'asignada', estadoNuevo: 'en_revision', motivo: 'Es de Agua' });
    expect(traslados.filas[0]).toMatchObject({ estado: 'aprobada', resolucionFinal: { resueltoPor: 50 } });
  });

  it('aprobar con la queja en resuelta deja la solicitud sin_efecto y lanza TRASLADO_SIN_EFECTO', async () => {
    const { tickets, traslados, servicio } = armar();
    tickets.agregar(1, 'en_proceso');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'Es de Agua' });
    tickets.agregar(1, 'resuelta');

    expect(await capturar(servicio.aprobar(SUPERVISOR, 1))).toMatchObject({ codigo: 'TRASLADO_SIN_EFECTO' });
    expect(traslados.filas[0].estado).toBe('sin_efecto');
    expect(tickets.transiciones).toEqual([]);
  });

  it.each(['', '   '])('rechazar con el motivo %p → MOTIVO_REQUERIDO', async (motivo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' });

    expect(() => servicio.rechazar(SUPERVISOR, 1, motivo)).toThrow(expect.objectContaining({ codigo: 'MOTIVO_REQUERIDO' }));
  });

  it('rechazar guarda el motivo recortado y la queja no cambia', async () => {
    const { tickets, traslados, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' });

    const respuesta = await servicio.rechazar(SUPERVISOR, 1, '  Sí es de Obras ');

    expect(respuesta.solicitud).toMatchObject({ estado: 'rechazada', motivoResolucion: 'Sí es de Obras' });
    expect(traslados.filas[0].resolucionFinal).toMatchObject({ resueltoPor: 50 });
    expect(tickets.transiciones).toEqual([]);
  });

  it('retirar solo lo hace el solicitante', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' });

    expect(await capturar(servicio.retirar(SUPERVISOR, 1))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect((await servicio.retirar(TECNICO, 1)).solicitud.estado).toBe('retirada');
  });

  it('resolver una ya resuelta → TRASLADO_YA_RESUELTO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' });
    await servicio.rechazar(SUPERVISOR, 1, 'No');

    for (const intento of [servicio.aprobar(SUPERVISOR, 1), servicio.rechazar(SUPERVISOR, 1, 'Otra'), servicio.retirar(TECNICO, 1)]) {
      expect(await capturar(intento)).toMatchObject({ codigo: 'TRASLADO_YA_RESUELTO' });
    }
  });

  it('una segunda solicitud pendiente → TRASLADO_PENDIENTE', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');
    await servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'x' });

    expect(await capturar(servicio.solicitar(TECNICO, 'solicitar', 1, { motivo: 'y' }))).toMatchObject({
      codigo: 'TRASLADO_PENDIENTE',
    });
  });

  it('una solicitud inexistente → NO_ENCONTRADO', async () => {
    const { servicio } = armar();

    expect(await capturar(servicio.aprobar(SUPERVISOR, 9))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});
