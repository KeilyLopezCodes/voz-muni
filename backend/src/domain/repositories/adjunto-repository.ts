import type { OrigenAdjunto } from '../adjuntos/reglas-adjuntos';
import type { Rol } from '../auth/roles';
import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { EstadoTicket } from '../ticket/estado-ticket';

// El ticket bloqueado para adjuntar o borrar, con lo que deciden el origen y los permisos.
export interface TicketParaAdjuntar {
  id: number;
  estado: EstadoTicket;
  solicitanteId: number;
  registradoPor: number | null;
  dependenciaId: number | null; // la de la bitácora (SPEC 42)
}

export interface NuevoAdjunto {
  ticketId: number;
  nombre: string;
  ruta: string;
  mime: string;
  tamanoBytes: number;
  subidoPor: number;
  interno: boolean;
  origen: OrigenAdjunto;
  creadoEn: Date;
}

export interface AdjuntoLeido {
  id: number;
  nombre: string;
  ruta: string; // nunca sale de la API
  mime: string;
  tamanoBytes: number;
  interno: boolean;
  origen: OrigenAdjunto;
  subidoPor: { id: number; nombre: string; rol: Rol };
  creadoEn: Date;
}

// Adjuntos de un ticket (SPEC 24). Se usa dentro de una Transaccion.
export interface AdjuntoRepository {
  // SELECT … FOR UPDATE con el filtro de alcance: los cupos se cuentan sin carreras. null si no existe, si está
  // fuera de alcance o si el filtro es null (sin consultar la base).
  ticketParaAdjuntar(id: number, filtro: FiltroTickets): Promise<TicketParaAdjuntar | null>;
  contarPorOrigen(ticketId: number, origen: OrigenAdjunto): Promise<number>;
  crear(adjunto: NuevoAdjunto): Promise<number>;
  // Sin `incluirInternos` los internos se excluyen en la consulta (WHERE interno = false). Orden creado_en ASC.
  listar(ticketId: number, incluirInternos: boolean): Promise<AdjuntoLeido[]>;
  // El adjunto debe ser de ese ticket; con la misma regla de visibilidad que listar.
  obtener(ticketId: number, adjuntoId: number, incluirInternos: boolean): Promise<AdjuntoLeido | null>;
  // FOR UPDATE. null si no existe, si es de otro ticket o si `autorId` no lo subió.
  obtenerDelAutor(ticketId: number, adjuntoId: number, autorId: number): Promise<AdjuntoLeido | null>;
  borrar(id: number): Promise<void>;
}
