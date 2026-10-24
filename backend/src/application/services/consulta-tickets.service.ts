import type { Accion } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Pagina, TicketLecturaRepository, TicketResumen } from '../../domain/repositories/ticket-lectura-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { TicketDetalleDto, TicketListadoDto } from '../dto/consulta-tickets.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

const TAMANO_MAXIMO = 100;
const TAMANO_MAXIMO_LISTADO = 50;

const isoONull = (fecha: Date | null) => (fecha === null ? null : fecha.toISOString());

function validarPaginacion(pagina: number, tamano: number, maximo: number): void {
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > maximo) {
    throw new ErrorDeAplicacion('VALIDACION', `pagina debe ser ≥ 1 y tamano estar entre 1 y ${maximo}`);
  }
}

// Entrada recomendada para leer tickets o cargarlos antes de actuar sobre ellos (SPEC 11).
export class ConsultaTicketsService {
  constructor(private readonly tickets: TicketLecturaRepository) {}

  listar(usuario: UsuarioAutenticado, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    validarPaginacion(pagina, tamano, TAMANO_MAXIMO);
    return this.tickets.listar(filtroTicketsParaAccion(usuario, 'tickets.ver'), pagina, tamano);
  }

  // Devuelve el ticket si el usuario puede verlo y hacer la acción. Fuera de alcance responde lo mismo que
  // un ticket inexistente, para no revelar qué tickets existen.
  async obtenerParaAccion(usuario: UsuarioAutenticado, accion: Accion, id: number): Promise<TicketResumen> {
    const ticket = await this.tickets.obtener(id, filtroTicketsParaAccion(usuario, accion));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
    }
    return ticket;
  }

  // GET /api/v1/tickets (SPEC 25): dentro del alcance de tickets.ver, las que están en espera primero.
  async listarParaUsuario(
    usuario: UsuarioAutenticado,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketListadoDto>> {
    validarPaginacion(pagina, tamano, TAMANO_MAXIMO_LISTADO);
    const resultado = await this.tickets.listarConTitulo(filtroTicketsParaAccion(usuario, 'tickets.ver'), pagina, tamano);
    return { ...resultado, datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString() })) };
  }

  // GET /api/v1/tickets/:id (SPEC 25). Con el filtro de tickets.ver en el mismo WHERE, igual que obtenerParaAccion:
  // fuera de alcance responde lo mismo que un ticket inexistente.
  async detalle(usuario: UsuarioAutenticado, id: number): Promise<TicketDetalleDto> {
    const ticket = await this.tickets.obtenerDetalle(id, filtroTicketsParaAccion(usuario, 'tickets.ver'));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
    }
    const { solicitanteId, creadoEn, resueltoEn, cerradoEn, ...resto } = ticket;
    return {
      ...resto,
      creadoEn: creadoEn.toISOString(),
      resueltoEn: isoONull(resueltoEn),
      cerradoEn: isoONull(cerradoEn),
      esSolicitante: solicitanteId === usuario.id,
    };
  }
}
