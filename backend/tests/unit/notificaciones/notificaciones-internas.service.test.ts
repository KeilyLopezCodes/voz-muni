import {
  type EventoInterno,
  NotificacionesInternasService,
} from '../../../src/application/services/notificaciones-internas.service';
import type { TicketAlcance } from '../../../src/domain/autorizacion/alcance-tickets';
import type { DestinatariosRepository, UsuarioDestino } from '../../../src/domain/repositories/destinatarios-repository';
import type { NotificacionRepository, NuevaNotificacion } from '../../../src/domain/repositories/notificacion-repository';
import type { ReposTransaccionales } from '../../../src/domain/repositories/transaccion';

const AHORA = new Date('2026-11-02T15:00:00.000Z');
const OBRAS = 4;

const TECNICO: UsuarioDestino = {
  id: 30,
  activo: true,
  dependenciaId: OBRAS,
  permisos: { 'tickets.ver': 'asignadas', 'comentarios.interno': 'si' },
};
const OTRO_TECNICO: UsuarioDestino = { ...TECNICO, id: 31 };
const COORDINADOR: UsuarioDestino = {
  id: 40,
  activo: true,
  dependenciaId: OBRAS,
  permisos: { 'tickets.ver': 'dependencia', 'comentarios.interno': 'si' },
};
const INACTIVO: UsuarioDestino = { ...COORDINADOR, id: 41, activo: false };
const SUPERVISOR: UsuarioDestino = { id: 50, activo: true, dependenciaId: null, permisos: { 'tickets.ver': 'todas', 'tickets.triage': 'todas', 'comentarios.interno': 'si' } };
const RECEPTOR: UsuarioDestino = { id: 60, activo: true, dependenciaId: null, permisos: { 'tickets.ver': 'registradas', 'comentarios.publico': 'si' } };

const TICKET: TicketAlcance = { solicitanteId: 7, registradoPor: 60, asignadoA: 30, dependenciaId: OBRAS };

class DestinatariosEnMemoria implements DestinatariosRepository {
  constructor(
    private readonly todos: UsuarioDestino[] = [TECNICO, OTRO_TECNICO, COORDINADOR, INACTIVO, SUPERVISOR, RECEPTOR],
    private readonly ticket: TicketAlcance | null = TICKET,
  ) {}

  async coordinadores(dependenciaId: number): Promise<number[]> {
    return this.todos.filter((u) => u.dependenciaId === dependenciaId && u.permisos['tickets.ver'] === 'dependencia').map((u) => u.id);
  }

  async supervisores(): Promise<number[]> {
    return [SUPERVISOR.id];
  }

  async participantes(): Promise<number[]> {
    return [OTRO_TECNICO.id, RECEPTOR.id, COORDINADOR.id];
  }

  async usuarios(ids: readonly number[]): Promise<UsuarioDestino[]> {
    return this.todos.filter((u) => ids.includes(u.id));
  }

  async alcanceTicket(): Promise<TicketAlcance | null> {
    return this.ticket;
  }
}

class NotificacionesEnMemoria implements Pick<NotificacionRepository, 'crear' | 'agruparComentario'> {
  readonly creadas: NuevaNotificacion[] = [];
  readonly agrupadas: [number, number, boolean][] = [];

  async crear(notificaciones: readonly NuevaNotificacion[]): Promise<void> {
    this.creadas.push(...notificaciones);
  }

  async agruparComentario(usuarioId: number, ticketId: number, interno: boolean): Promise<void> {
    this.agrupadas.push([usuarioId, ticketId, interno]);
  }
}

function montar(destinatarios = new DestinatariosEnMemoria()) {
  const notificaciones = new NotificacionesEnMemoria();
  const repos = { destinatarios, notificaciones } as unknown as ReposTransaccionales;
  const notificar = (evento: Partial<EventoInterno>) =>
    new NotificacionesInternasService().notificar(
      repos,
      { tipo: 'queja_reabierta', ticketId: 1, autorId: null, candidatos: {}, datos: {}, ...evento },
      AHORA,
    );
  return { notificaciones, notificar };
}

const destinatariosDe = (creadas: NuevaNotificacion[]) => creadas.map((n) => n.usuarioId);

describe('NotificacionesInternasService', () => {
  it('quita al autor, los duplicados y los inactivos, y crea una fila por destinatario', async () => {
    const { notificaciones, notificar } = montar();

    const cantidad = await notificar({
      autorId: COORDINADOR.id,
      candidatos: { usuarios: [TECNICO.id, TECNICO.id, INACTIVO.id, null], coordinadoresDe: OBRAS },
    });

    expect(cantidad).toBe(1);
    expect(notificaciones.creadas).toEqual([{ usuarioId: TECNICO.id, ticketId: 1, tipo: 'queja_reabierta', datos: {}, creadoEn: AHORA }]);
  });

  it('quita a quien no tiene la queja en su alcance de tickets.ver', async () => {
    const { notificaciones, notificar } = montar();

    // El otro técnico no la tiene asignada; el receptor la ve porque la registró (alcance registradas).
    await notificar({ candidatos: { usuarios: [OTRO_TECNICO.id, RECEPTOR.id, SUPERVISOR.id] } });

    expect(destinatariosDe(notificaciones.creadas)).toEqual([SUPERVISOR.id, RECEPTOR.id]);
  });

  it('con una queja sin dependencia, los coordinadores ya no la ven', async () => {
    const { notificaciones, notificar } = montar(
      new DestinatariosEnMemoria(undefined, { ...TICKET, asignadoA: null, dependenciaId: null }),
    );

    await notificar({ candidatos: { usuarios: [TECNICO.id, COORDINADOR.id], supervisores: true } });

    expect(destinatariosDe(notificaciones.creadas)).toEqual([SUPERVISOR.id]);
  });

  it('con requiereComentariosInternos quita a quien no tiene comentarios.interno', async () => {
    const { notificaciones, notificar } = montar();

    await notificar({ tipo: 'comentario_nuevo', candidatos: { participantes: true, usuarios: [TECNICO.id] }, requiereComentariosInternos: true });

    expect(notificaciones.agrupadas).toEqual([
      [TECNICO.id, 1, true],
      [COORDINADOR.id, 1, true],
    ]);
  });

  it('comentario_nuevo agrupa en lugar de crear; un comentario público llega también al receptor que lo registró', async () => {
    const { notificaciones, notificar } = montar();

    await notificar({ tipo: 'comentario_nuevo', autorId: TECNICO.id, candidatos: { participantes: true, usuarios: [TECNICO.id] } });

    expect(notificaciones.creadas).toEqual([]);
    expect(notificaciones.agrupadas).toEqual([
      [COORDINADOR.id, 1, false],
      [RECEPTOR.id, 1, false],
    ]);
  });

  it('sin candidatos o sin la queja no escribe nada', async () => {
    expect(await montar().notificar({ candidatos: {} })).toBe(0);
    const sinQueja = montar(new DestinatariosEnMemoria(undefined, null));
    expect(await sinQueja.notificar({ candidatos: { usuarios: [TECNICO.id] } })).toBe(0);
    expect(sinQueja.notificaciones.creadas).toEqual([]);
  });
});
