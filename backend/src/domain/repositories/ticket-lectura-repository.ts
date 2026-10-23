import type { FiltroTickets, TicketAlcance } from '../autorizacion/alcance-tickets';
import type { EstadoTicket } from '../ticket/estado-ticket';

export interface TicketResumen extends TicketAlcance {
  id: number;
  numero: string;
  estado: EstadoTicket;
  creadoEn: Date;
}

export interface Pagina<T> {
  datos: T[];
  pagina: number;
  tamano: number;
  total: number;
}

// Lectura de tickets siempre filtrada por alcance (SPEC 11). Un filtro null no consulta la base.
export interface TicketLecturaRepository {
  // Ordenado por creado_en DESC y luego id DESC.
  listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>>;
  // El filtro va en el mismo WHERE que el id: un ticket fuera de alcance devuelve null, igual que uno inexistente.
  obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null>;
}
