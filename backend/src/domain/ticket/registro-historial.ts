import type { EstadoTicket } from './estado-ticket';

// Se corresponde con una fila de ticket_historial.
export interface RegistroHistorial {
  ticketId: number;
  estadoAnterior: EstadoTicket | null; // null solo en el registro de creación (SPEC 12)
  estadoNuevo: EstadoTicket;
  usuarioId: number | null;
  motivo: string | null;
  creadoEn: Date;
}
