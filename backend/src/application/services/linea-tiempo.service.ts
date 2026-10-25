import { esVistaPublica, motivoEsPublico } from '../../domain/linea-tiempo/visibilidad';
import type {
  ActorEvento,
  EventoLineaTiempo,
  LineaTiempoRepository,
} from '../../domain/repositories/linea-tiempo-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { ConsultaTicketsService } from './consulta-tickets.service';

export interface CursorLineaTiempo {
  ocurridoEn: Date;
  id: string;
}

export interface PaginaLineaTiempo {
  datos: EventoLineaTiempo[];
  siguienteCursor: string | null;
}

const ID_EVENTO = /^[a-z_]+:\d+$/;

// El cursor es opaco para el cliente: el base64url de { ocurridoEn, id } del último evento de la página.
export function codificarCursor(evento: EventoLineaTiempo): string {
  return Buffer.from(JSON.stringify({ ocurridoEn: evento.ocurridoEn, id: evento.id })).toString('base64url');
}

// null si el cursor está mal formado.
export function decodificarCursor(cursor: string): CursorLineaTiempo | null {
  try {
    const datos: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof datos !== 'object' || datos === null) {
      return null;
    }
    const { ocurridoEn, id } = datos as Record<string, unknown>;
    if (typeof ocurridoEn !== 'string' || typeof id !== 'string' || !ID_EVENTO.test(id)) {
      return null;
    }
    const fecha = new Date(ocurridoEn);
    return Number.isNaN(fecha.getTime()) ? null : { ocurridoEn: fecha, id };
  } catch {
    return null;
  }
}

// GET /api/v1/tickets/:id/linea-tiempo (RF-25, SPEC 28). Qué se ve depende del alcance de tickets.ver y de
// comentarios.interno, nunca del nombre del rol.
export class LineaTiempoService {
  constructor(
    private readonly consultaTickets: Pick<ConsultaTicketsService, 'obtenerParaAccion'>,
    private readonly lineaTiempo: LineaTiempoRepository,
  ) {}

  async listar(
    usuario: UsuarioAutenticado,
    ticketId: number,
    antesDe: CursorLineaTiempo | null,
    tamano: number,
  ): Promise<PaginaLineaTiempo> {
    // Fuera de alcance responde 404, igual que un ticket inexistente (SPEC 11).
    await this.consultaTickets.obtenerParaAccion(usuario, 'tickets.ver', ticketId);
    const alcanceVer = usuario.permisos['tickets.ver'];
    const vistaPublica = alcanceVer !== undefined && esVistaPublica(alcanceVer);
    const eventos = await this.lineaTiempo.listar(ticketId, {
      vistaPublica,
      incluirInternos: usuario.permisos['comentarios.interno'] !== undefined,
      usuarioId: usuario.id,
      antesDe,
      // Uno más para saber si hay otra página.
      limite: tamano + 1,
    });
    const pagina = eventos.slice(0, tamano);
    const datos = vistaPublica ? pagina.map((e) => this.aVistaPublica(e, usuario.id)) : pagina;
    return {
      datos,
      siguienteCursor: eventos.length > tamano ? codificarCursor(pagina[pagina.length - 1]) : null,
    };
  }

  // El vecino no ve nombres internos ni motivos que no van dirigidos a él.
  private aVistaPublica(evento: EventoLineaTiempo, usuarioId: number): EventoLineaTiempo {
    const actor: ActorEvento =
      evento.actor.tipo !== 'usuario'
        ? evento.actor
        : evento.actor.id === usuarioId
          ? { tipo: 'tu' }
          : { tipo: 'municipalidad' };
    const { detalle } = evento;
    if (detalle.tipo === 'estado' && !motivoEsPublico(detalle.estadoAnterior, detalle.estadoNuevo)) {
      return { ...evento, actor, detalle: { ...detalle, motivo: null } };
    }
    return { ...evento, actor };
  }
}
