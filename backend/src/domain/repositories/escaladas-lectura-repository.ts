import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { SlaLectura } from '../sla/vencimientos';
import type { Prioridad } from '../ticket/prioridad';
import type { TipoPlazo } from '../ticket/ticket';
import type { Pagina } from './ticket-lectura-repository';

// Las quejas escaladas que todavía se atienden (SPEC 32): ni resueltas ni finales.
export const ESTADOS_ESCALADAS = ['asignada', 'en_proceso', 'en_espera', 'en_revision'] as const;

export type EstadoEscalada = (typeof ESTADOS_ESCALADAS)[number];

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketEscalado {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoEscalada;
  prioridad: Prioridad;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null; // null en revisión tras un traslado
  tecnico: { id: number; nombre: string } | null;
  escaladoEn: Date;
  escaladoPor: TipoPlazo;
  sla: SlaLectura;
}

// Bandeja /escaladas (SPEC 32), siempre filtrada por alcance (SPEC 11). Un filtro null no consulta la base.
export interface EscaladasLecturaRepository {
  // Ordenada por escalado_en ASC y luego id ASC. Con `dependenciaId`, las que están en revisión sin dependencia
  // quedan fuera.
  listar(
    filtro: FiltroTickets,
    dependenciaId: number | null,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketEscalado>>;
}
