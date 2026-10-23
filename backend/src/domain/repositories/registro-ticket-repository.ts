import type { TicketRegistrado } from '../ticket/ticket';

export interface TicketCreado {
  id: number;
  numero: string; // Q-AAAA-NNNNNN
  creadoEn: Date;
}

export interface RegistroTicketRepository {
  // En una sola transacción: toma el siguiente correlativo del año en Guatemala, inserta el ticket y su historial.
  // Si algo falla, nada queda escrito y el número no se pierde (sin huecos).
  // Lanza ReglaDeNegocioError CORRELATIVO_AGOTADO si el año ya usó los 999999 números.
  registrar(registro: TicketRegistrado): Promise<TicketCreado>;
}
