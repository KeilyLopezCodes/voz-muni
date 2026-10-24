import { esVistaPublica, motivoEsPublico } from '../../domain/linea-tiempo/visibilidad';
import type {
  ActorEvento,
  DetalleEvento,
  EventoLeido,
  LineaTiempoRepository,
} from '../../domain/repositories/linea-tiempo-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { EventoLineaTiempoDto, PaginaLineaTiempoDto } from '../dto/linea-tiempo.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { ConsultaTicketsService } from './consulta-tickets.service';

interface Cursor {
  ocurridoEn: string;
  id: string;
}

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const ID_EVENTO = /^[a-z_]{1,30}:\d{1,19}$/;

export function codificarCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

// Un cursor mal formado responde VALIDACION: es opaco, pero viene del cliente.
export function decodificarCursor(texto: string): Cursor {
  try {
    const valor = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof valor.ocurridoEn === 'string' && INSTANTE.test(valor.ocurridoEn) && typeof valor.id === 'string' && ID_EVENTO.test(valor.id)) {
      return { ocurridoEn: valor.ocurridoEn, id: valor.id };
    }
  } catch {
    // cae al error de abajo
  }
  throw new ErrorDeAplicacion('VALIDACION', 'cursor inválido');
}

// Línea de tiempo de la queja (RF-25, SPEC 28). La vista depende del alcance de tickets.ver y de
// comentarios.interno, nunca del nombre del rol.
export class LineaTiempoService {
  constructor(
    private readonly consulta: Pick<ConsultaTicketsService, 'obtenerParaAccion'>,
    private readonly repositorio: LineaTiempoRepository,
  ) {}

  async listar(
    usuario: UsuarioAutenticado,
    ticketId: number,
    cursor: string | undefined,
    tamano: number,
  ): Promise<PaginaLineaTiempoDto> {
    const antesDe = cursor === undefined ? null : decodificarCursor(cursor);
    const ticket = await this.consulta.obtenerParaAccion(usuario, 'tickets.ver', ticketId);
    const vistaPublica = esVistaPublica(usuario.permisos['tickets.ver']);
    const leidos = await this.repositorio.listar(ticketId, {
      vistaPublica,
      incluirInternos: usuario.permisos['comentarios.interno'] !== undefined,
      antesDe,
      limite: tamano + 1,
    });
    const pagina = leidos.slice(0, tamano);
    const ultimo = pagina.at(-1);
    return {
      datos: pagina.map((evento) => aDto(evento, vistaPublica, usuario.id, ticket.solicitanteId)),
      siguienteCursor:
        leidos.length > tamano && ultimo ? codificarCursor({ ocurridoEn: ultimo.ocurridoUs, id: ultimo.id }) : null,
    };
  }
}

function aDto(evento: EventoLeido, vistaPublica: boolean, usuarioId: number, solicitanteId: number): EventoLineaTiempoDto {
  return {
    id: evento.id,
    ocurridoEn: evento.ocurridoEn.toISOString(),
    actor: actorDe(evento, vistaPublica, usuarioId, solicitanteId),
    detalle: vistaPublica ? detallePublico(evento.detalle) : evento.detalle,
  };
}

function actorDe(evento: EventoLeido, vistaPublica: boolean, usuarioId: number, solicitanteId: number): ActorEvento {
  const { actor } = evento;
  if (actor === null) {
    return { tipo: 'sistema' };
  }
  if (vistaPublica) {
    return actor.id === usuarioId ? { tipo: 'tu' } : { tipo: 'municipalidad' };
  }
  return { tipo: 'usuario', id: actor.id, nombre: actor.nombre, rol: actor.rol, esSolicitante: actor.id === solicitanteId };
}

// En la vista pública solo quedan los motivos dirigidos al vecino.
function detallePublico(detalle: DetalleEvento): DetalleEvento {
  if (detalle.tipo !== 'estado' || motivoEsPublico(detalle.estadoAnterior, detalle.estadoNuevo)) {
    return detalle;
  }
  return { ...detalle, motivo: null };
}
