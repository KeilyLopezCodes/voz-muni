import type { EstadoTicket } from '../ticket/estado-ticket';

// Lo que la consulta pública necesita de una queja (RF-35, SPEC 37). El contacto del solicitante solo sirve para
// compararlo: el servicio nunca lo devuelve.
export interface QuejaPublica {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  categoria: string;
  zona: string;
  creadoEn: Date;
  resueltoEn: Date | null;
  cerradoEn: Date | null;
  cierreAutomatico: boolean; // la última transición a cerrada no tiene usuario (SPEC 33)
  resolucion: string | null;
  confirmacionVenceEn: Date | null;
  solicitante: { id: number; email: string | null; telefono: string | null };
}

export interface CambioDeEstadoPublico {
  ocurridoEn: Date;
  usuarioId: number | null;
  estadoAnterior: EstadoTicket | null;
  estadoNuevo: EstadoTicket;
  motivo: string | null;
}

export interface ComentarioPublico {
  cuerpo: string;
  autorId: number;
  creadoEn: Date;
  editadoEn: Date | null;
}

// Solo lectura. Nunca devuelve notas internas.
export interface ConsultaPublicaRepository {
  // null si no existe una queja con ese número.
  obtenerPorNumero(numero: string): Promise<QuejaPublica | null>;
  // Los `limite` cambios de estado más recientes, del más reciente al más antiguo.
  cambiosDeEstado(ticketId: number, limite: number): Promise<CambioDeEstadoPublico[]>;
  // Los `limite` comentarios públicos más recientes, en orden cronológico.
  comentariosPublicos(ticketId: number, limite: number): Promise<ComentarioPublico[]>;
}
