import type { FiltroTickets, TicketAlcance } from '../autorizacion/alcance-tickets';
import type { EstadoTicket } from '../ticket/estado-ticket';

export interface TicketResumen extends TicketAlcance {
  id: number;
  numero: string;
  estado: EstadoTicket;
  creadoEn: Date;
}

// Fila de GET /api/v1/tickets (SPEC 25).
export interface TicketListado {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  creadoEn: Date;
  esperaRespuesta: boolean; // estado === 'en_espera'
}

// Detalle básico de GET /api/v1/tickets/:id (SPEC 25). Del solicitante solo trae el id, para saber si quien
// consulta es él; nunca correo, teléfono ni DPI. Tampoco prioridad, técnico, coordenadas ni datos adicionales.
export interface TicketDetalleLectura {
  id: number;
  numero: string;
  estado: EstadoTicket;
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  dependencia: { id: number; nombre: string } | null;
  creadoEn: Date;
  resueltoEn: Date | null;
  cerradoEn: Date | null;
  informacionSolicitada: string | null; // motivo de la última transición a en_espera, solo si está en espera
  solicitanteId: number;
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
  // Mismo filtro que listar; primero las que están en en_espera, luego creado_en DESC e id DESC (SPEC 25).
  listarConTitulo(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketListado>>;
  // Filtro en el mismo WHERE que el id, como obtener.
  obtenerDetalle(id: number, filtro: FiltroTickets): Promise<TicketDetalleLectura | null>;
}
