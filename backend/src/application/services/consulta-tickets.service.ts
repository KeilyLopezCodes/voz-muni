import type { Accion } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Pagina, TicketLecturaRepository, TicketResumen } from '../../domain/repositories/ticket-lectura-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

const TAMANO_MAXIMO = 100;

// Entrada recomendada para leer tickets o cargarlos antes de actuar sobre ellos (SPEC 11).
export class ConsultaTicketsService {
  constructor(private readonly tickets: TicketLecturaRepository) {}

  listar(usuario: UsuarioAutenticado, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > TAMANO_MAXIMO) {
      throw new ErrorDeAplicacion('VALIDACION', `pagina debe ser ≥ 1 y tamano estar entre 1 y ${TAMANO_MAXIMO}`);
    }
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
}
