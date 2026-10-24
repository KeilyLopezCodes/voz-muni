import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { ResultadoTransicion, Ticket } from '../ticket/ticket';

// Ticket bloqueado para transicionar, con lo que necesitan la nota del historial y el correo al solicitante.
export interface TicketParaTransicion {
  ticket: Ticket;
  titulo: string;
  categoria: { id: number; nombre: string };
  solicitante: { id: number; nombre: string; email: string | null };
}

// Categoría final de un ticket aceptado y la dependencia que le corresponde (RF-13).
export interface CategoriaDestino {
  id: number;
  nombre: string;
  activa: boolean; // la categoría y su dependencia están activas
  dependenciaId: number;
  dependenciaNombre: string;
}

// Escritura de las transiciones del ticket (SPEC 19). Se usa dentro de una Transaccion.
export interface TicketEscrituraRepository {
  // SELECT … FOR UPDATE con el filtro de alcance en el mismo WHERE: otra transición sobre el mismo ticket espera
  // al commit. Devuelve null si no existe, si está fuera de alcance o si el filtro es null (sin consultar la base).
  obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null>;
  obtenerCategoria(categoriaId: number): Promise<CategoriaDestino | null>;
  // Solo cambia asignado_a: asignar un técnico no cambia el estado ni escribe historial (SPEC 20).
  guardarTecnico(ticket: Ticket): Promise<void>;
  // Actualiza el ticket (estado, prioridad, dependencia, técnico, marcas y categoría) e inserta su historial.
  guardarTransicion(resultado: ResultadoTransicion, categoriaId: number): Promise<void>;
}
