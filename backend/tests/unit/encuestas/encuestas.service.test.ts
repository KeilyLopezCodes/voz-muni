import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { EncuestasService } from '../../../src/application/services/encuestas.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { cumpleFiltro } from '../../../src/domain/autorizacion/alcance-tickets';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { Encuesta, EncuestaRepository } from '../../../src/domain/repositories/encuesta-repository';
import type { TicketParaTransicion } from '../../../src/domain/repositories/ticket-escritura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { Ticket } from '../../../src/domain/ticket/ticket';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';
import { NotificacionesInternasFalsas } from '../notificaciones/dobles-notificaciones';
import { SLA_VACIO } from '../sla/dobles-sla';

const AHORA = new Date('2026-11-10T15:00:00.000Z');
const CERRADA_EN = new Date('2026-11-01T15:00:00.000Z');
const VECINO = 7;
const OBRAS = 4;

const vecino: UsuarioAutenticado = { id: VECINO, nombre: 'Ana', rol: 'vecino', dependenciaId: null, permisos: { 'tickets.ver': 'propia' } };
const coordinador: UsuarioAutenticado = {
  id: 40,
  nombre: 'Carlos',
  rol: 'coordinador',
  dependenciaId: OBRAS,
  permisos: { 'tickets.ver': 'dependencia' },
};

function ticket(estado: EstadoTicket, cerradoEn: Date | null): Ticket {
  return Ticket.reconstituir({
    id: 1,
    numero: 'Q-2026-000001',
    estado,
    dependenciaId: OBRAS,
    asignadoA: 30,
    prioridad: 'media',
    escalado: false,
    escaladoEn: null,
    escaladoPor: null,
    resueltoEn: null,
    cerradoEn,
    resolucion: null,
    resueltoPor: null,
    confirmacionVenceEn: null,
    reaperturas: 0,
  });
}

class TicketsEnMemoria {
  constructor(private readonly actual: Ticket) {}

  async obtenerParaActualizar(_id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    const alcance = { solicitanteId: VECINO, registradoPor: VECINO, asignadoA: 30, dependenciaId: OBRAS };
    if (!cumpleFiltro(alcance, filtro)) {
      return null;
    }
    return { ticket: this.actual, titulo: 'Bache', categoria: { id: 1, nombre: 'Baches' }, solicitante: { id: VECINO, nombre: 'Ana', email: null }, sla: SLA_VACIO };
  }
}

class EncuestasEnMemoria implements EncuestaRepository {
  readonly filas = new Map<number, Encuesta>();

  async obtener(ticketId: number): Promise<Encuesta | null> {
    return this.filas.get(ticketId) ?? null;
  }

  async crear(ticketId: number, encuesta: Encuesta): Promise<void> {
    if (this.filas.has(ticketId)) {
      throw new ReglaDeNegocioError('ENCUESTA_EXISTENTE', 'ya tiene');
    }
    this.filas.set(ticketId, encuesta);
  }
}

function armar({ estado = 'cerrada' as EstadoTicket, cerradoEn = CERRADA_EN as Date | null, parametros = { encuesta_plazo_dias: 30, encuesta_umbral_alerta: 2 } as Record<string, unknown> } = {}) {
  const encuestas = new EncuestasEnMemoria();
  const internas = new NotificacionesInternasFalsas();
  const servicio = new EncuestasService(
    new TransaccionEnMemoria({ ticketsEscritura: new TicketsEnMemoria(ticket(estado, cerradoEn)) as never, encuestas }),
    { obtener: async (clave) => parametros[clave] ?? null, guardar: async () => {} },
    new RelojFalso(AHORA),
    internas,
  );
  return { encuestas, internas, servicio };
}

const error = (promesa: Promise<unknown>) => promesa.then(() => null, (e: { codigo: string }) => e.codigo);

describe('EncuestasService', () => {
  it('el vecino califica su queja cerrada: guarda el comentario recortado y responde la encuesta', async () => {
    const { encuestas, internas, servicio } = armar();

    expect(await servicio.calificar(vecino, 1, { calificacion: 4, comentario: '  Bien  ' })).toEqual({
      calificacion: 4,
      comentario: 'Bien',
      creadoEn: AHORA.toISOString(),
    });
    expect(encuestas.filas.get(1)).toEqual({ calificacion: 4, comentario: 'Bien', creadoEn: AHORA });
    expect(internas.eventos).toEqual([]);
  });

  it('una calificación menor o igual al umbral avisa encuesta_baja a los coordinadores de la dependencia', async () => {
    const { internas, servicio } = armar();

    await servicio.calificar(vecino, 1, { calificacion: 2 });

    expect(internas.eventos).toEqual([
      { tipo: 'encuesta_baja', ticketId: 1, autorId: VECINO, candidatos: { coordinadoresDe: OBRAS }, datos: { calificacion: 2 } },
    ]);
  });

  it('con el umbral en 0 nunca avisa', async () => {
    const { internas, servicio } = armar({ parametros: { encuesta_plazo_dias: 30, encuesta_umbral_alerta: 0 } });
    await servicio.calificar(vecino, 1, { calificacion: 1 });
    expect(internas.eventos).toEqual([]);
  });

  it('un interno con alcance → PERMISO_DENEGADO; sin alcance → NO_ENCONTRADO', async () => {
    const { servicio } = armar();
    expect(await error(servicio.calificar(coordinador, 1, { calificacion: 4 }))).toBe('PERMISO_DENEGADO');
    expect(await error(servicio.calificar({ ...vecino, id: 99 }, 1, { calificacion: 4 }))).toBe('NO_ENCONTRADO');
  });

  it('traduce las reglas: no disponible, vencida y existente', async () => {
    expect(await error(armar({ estado: 'resuelta', cerradoEn: null }).servicio.calificar(vecino, 1, { calificacion: 4 }))).toBe(
      'ENCUESTA_NO_DISPONIBLE',
    );
    expect(
      await error(armar({ cerradoEn: new Date('2026-09-01T15:00:00.000Z') }).servicio.calificar(vecino, 1, { calificacion: 4 })),
    ).toBe('ENCUESTA_VENCIDA');
    const { servicio } = armar();
    await servicio.calificar(vecino, 1, { calificacion: 4 });
    expect(await error(servicio.calificar(vecino, 1, { calificacion: 5 }))).toBe('ENCUESTA_EXISTENTE');
  });

  it.each([
    [{ encuesta_umbral_alerta: 2 }],
    [{ encuesta_plazo_dias: 0, encuesta_umbral_alerta: 2 }],
    [{ encuesta_plazo_dias: 30, encuesta_umbral_alerta: 6 }],
  ])('un parámetro que falta o no es válido → PARAMETRO_INVALIDO y no guarda (%j)', async (parametros) => {
    const { encuestas, servicio } = armar({ parametros });
    expect(await error(servicio.calificar(vecino, 1, { calificacion: 4 }))).toBe('PARAMETRO_INVALIDO');
    expect(encuestas.filas.size).toBe(0);
  });
});
