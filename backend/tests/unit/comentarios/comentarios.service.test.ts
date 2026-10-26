import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ComentariosService } from '../../../src/application/services/comentarios.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import type {
  ComentarioEditable,
  ComentarioLeido,
  ComentarioRepository,
  NuevoComentario,
} from '../../../src/domain/repositories/comentario-repository';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { TicketLecturaRepository } from '../../../src/domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket } from '../../../src/domain/ticket/ticket';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';
import { SLA_VACIO, SlaNulo } from '../sla/dobles-sla';

const AHORA = new Date('2026-10-23T15:00:00.000Z');
const VECINO_ID = 7;

const VECINO: UsuarioAutenticado = {
  id: VECINO_ID,
  nombre: 'Ana López',
  rol: 'vecino',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'propia', 'comentarios.publico': 'si' },
};

const TECNICO: UsuarioAutenticado = {
  id: 30,
  nombre: 'Luis Técnico',
  rol: 'tecnico',
  dependenciaId: 4,
  permisos: { 'tickets.ver': 'asignadas', 'comentarios.publico': 'si', 'comentarios.interno': 'si' },
};

const RECEPTOR: UsuarioAutenticado = {
  id: 20,
  nombre: 'Rosa Receptora',
  rol: 'receptor',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'todas', 'comentarios.publico': 'si', 'comentarios.interno': 'si' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly tickets = new Map<number, Ticket>();
  readonly guardadas: ResultadoTransicion[] = [];

  agregar(id: number, estado: EstadoTicket): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: 4,
        asignadoA: 30,
        prioridad: 'media',
        escalado: false,
        escaladoEn: null,
        escaladoPor: null,
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
    const ticket = this.tickets.get(id);
    if (!ticket || filtro === null) return null;
    return {
      ticket,
      titulo: 'Bache',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: VECINO_ID, nombre: 'Ana López', email: null },
      sla: SLA_VACIO,
    };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.guardadas.push(resultado);
    this.tickets.set(resultado.ticket.id, resultado.ticket);
  }
}

class ComentariosEnMemoria implements ComentarioRepository {
  readonly filas: (NuevoComentario & { id: number; editadoEn: Date | null })[] = [];
  readonly consultas: boolean[] = [];

  async crear(comentario: NuevoComentario): Promise<number> {
    const id = this.filas.length + 1;
    this.filas.push({ ...comentario, id, editadoEn: null });
    return id;
  }

  // Como la consulta real: el filtro de internas va en el WHERE.
  async listar(ticketId: number, incluirInternos: boolean): Promise<ComentarioLeido[]> {
    this.consultas.push(incluirInternos);
    return this.filas.filter((f) => f.ticketId === ticketId && (incluirInternos || !f.interno)).map((f) => this.leido(f));
  }

  async obtener(id: number): Promise<ComentarioLeido | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? this.leido(fila) : null;
  }

  async obtenerDelAutor(ticketId: number, comentarioId: number, autorId: number): Promise<ComentarioEditable | null> {
    const fila = this.filas.find((f) => f.id === comentarioId && f.ticketId === ticketId && f.autorId === autorId);
    return fila ? { id: fila.id, interno: fila.interno, creadoEn: fila.creadoEn } : null;
  }

  async editar(id: number, cuerpo: string, editadoEn: Date): Promise<void> {
    Object.assign(this.filas.find((f) => f.id === id)!, { cuerpo, editadoEn });
  }

  private leido(f: NuevoComentario & { id: number; editadoEn: Date | null }): ComentarioLeido {
    return {
      id: f.id,
      cuerpo: f.cuerpo,
      interno: f.interno,
      autor: { id: f.autorId, nombre: `Usuario ${f.autorId}`, rol: f.autorId === VECINO_ID ? 'vecino' : 'tecnico' },
      esDelSolicitante: f.autorId === VECINO_ID,
      creadoEn: f.creadoEn,
      editadoEn: f.editadoEn,
    };
  }
}

function armar() {
  const tickets = new TicketsEnMemoria();
  const comentarios = new ComentariosEnMemoria();
  const reloj = new RelojFalso(AHORA);
  const lectura = { obtener: async (id: number) => (tickets.tickets.has(id) ? ({ id } as never) : null) };
  const servicio = new ComentariosService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository, comentarios }),
    lectura as unknown as TicketLecturaRepository,
    reloj,
    new SlaNulo(),
  );
  return { tickets, comentarios, reloj, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('ComentariosService', () => {
  it('un interno comenta en público y en privado; el estado no cambia', async () => {
    const { tickets, comentarios, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const publico = await servicio.comentar(TECNICO, 1, { cuerpo: '  Vamos mañana  ', interno: false });
    const nota = await servicio.comentar(TECNICO, 1, { cuerpo: 'Llevar pala', interno: true });

    expect(publico).toEqual({
      comentario: {
        id: 1,
        cuerpo: 'Vamos mañana',
        interno: false,
        autor: { id: 30, nombre: 'Usuario 30', rol: 'tecnico' },
        esDelSolicitante: false,
        creadoEn: AHORA.toISOString(),
        editadoEn: null,
        editable: true,
      },
      ticket: { id: 1, estado: 'en_proceso' },
    });
    expect(nota.comentario.interno).toBe(true);
    expect(comentarios.filas.map((f) => f.creadoEn)).toEqual([AHORA, AHORA]);
    expect(tickets.guardadas).toEqual([]);
  });

  it('el vecino comenta su queja en en_espera: pasa a en_proceso con historial a su nombre y sin motivo', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_espera');

    const respuesta = await servicio.comentar(VECINO, 1, { cuerpo: 'Es la casa 12', interno: false });

    expect(respuesta.ticket).toEqual({ id: 1, estado: 'en_proceso' });
    expect(respuesta.comentario.esDelSolicitante).toBe(true);
    expect(tickets.guardadas[0].historial).toMatchObject({
      estadoAnterior: 'en_espera',
      estadoNuevo: 'en_proceso',
      usuarioId: VECINO_ID,
      motivo: null,
    });
  });

  it('el vecino comenta en en_proceso: no cambia el estado', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect((await servicio.comentar(VECINO, 1, { cuerpo: '¿Cuándo vienen?', interno: false })).ticket.estado).toBe('en_proceso');
    expect(tickets.guardadas).toEqual([]);
  });

  it('un receptor comenta en público en en_espera: no reanuda', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_espera');

    expect((await servicio.comentar(RECEPTOR, 1, { cuerpo: 'El vecino llamó', interno: false })).ticket.estado).toBe('en_espera');
    expect(tickets.guardadas).toEqual([]);
  });

  it('en cerrada una nota interna se acepta y un público lanza QUEJA_FINALIZADA', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'cerrada');

    expect((await servicio.comentar(TECNICO, 1, { cuerpo: 'Archivo', interno: true })).comentario.interno).toBe(true);
    expect(await capturar(servicio.comentar(TECNICO, 1, { cuerpo: 'Hola', interno: false }))).toMatchObject({
      codigo: 'QUEJA_FINALIZADA',
    });
  });

  it('un cuerpo en blanco lanza CUERPO_INVALIDO y no guarda nada', async () => {
    const { tickets, comentarios, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.comentar(TECNICO, 1, { cuerpo: '   ', interno: false }))).toMatchObject({
      codigo: 'CUERPO_INVALIDO',
    });
    expect(comentarios.filas).toEqual([]);
  });

  it('un ticket inexistente o fuera de alcance → NO_ENCONTRADO', async () => {
    const { servicio } = armar();

    expect(await capturar(servicio.comentar(TECNICO, 9, { cuerpo: 'x', interno: false }))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(await capturar(servicio.listar(TECNICO, 9))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('el listado sin comentarios.interno no incluye notas, y lo pide así a la consulta', async () => {
    const { tickets, comentarios, servicio } = armar();
    tickets.agregar(1, 'en_proceso');
    await servicio.comentar(TECNICO, 1, { cuerpo: 'Público', interno: false });
    await servicio.comentar(TECNICO, 1, { cuerpo: 'Nota', interno: true });

    expect((await servicio.listar(VECINO, 1)).datos.map((c) => c.cuerpo)).toEqual(['Público']);
    expect((await servicio.listar(TECNICO, 1)).datos.map((c) => c.cuerpo)).toEqual(['Público', 'Nota']);
    expect(comentarios.consultas).toEqual([false, true]);
  });

  it('editable es true solo para el autor y dentro de los 5 minutos', async () => {
    const { tickets, reloj, servicio } = armar();
    tickets.agregar(1, 'en_proceso');
    await servicio.comentar(TECNICO, 1, { cuerpo: 'Público', interno: false });

    expect((await servicio.listar(TECNICO, 1)).datos[0].editable).toBe(true);
    expect((await servicio.listar(RECEPTOR, 1)).datos[0].editable).toBe(false);
    reloj.actual = new Date(AHORA.getTime() + 5 * 60_000 + 1);
    expect((await servicio.listar(TECNICO, 1)).datos[0].editable).toBe(false);
  });

  it('el autor edita dentro del plazo: deja editadoEn y no reanuda', async () => {
    const { tickets, reloj, servicio } = armar();
    tickets.agregar(1, 'en_espera');
    const { comentario } = await servicio.comentar(RECEPTOR, 1, { cuerpo: 'Primero', interno: false });
    reloj.actual = new Date(AHORA.getTime() + 2 * 60_000);

    const editado = await servicio.editar(RECEPTOR, 1, comentario.id, ' Corregido ');

    expect(editado).toMatchObject({ cuerpo: 'Corregido', editadoEn: reloj.actual.toISOString() });
    expect(tickets.tickets.get(1)!.estado).toBe('en_espera');
  });

  it('editar fuera de plazo → EDICION_VENCIDA; el de otro autor → NO_ENCONTRADO', async () => {
    const { tickets, reloj, servicio } = armar();
    tickets.agregar(1, 'en_proceso');
    const { comentario } = await servicio.comentar(TECNICO, 1, { cuerpo: 'Primero', interno: false });

    expect(await capturar(servicio.editar(RECEPTOR, 1, comentario.id, 'x'))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    reloj.actual = new Date(AHORA.getTime() + 6 * 60_000);
    expect(await capturar(servicio.editar(TECNICO, 1, comentario.id, 'x'))).toMatchObject({ codigo: 'EDICION_VENCIDA' });
  });
});
