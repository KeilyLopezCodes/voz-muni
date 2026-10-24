import type { SlaLectura } from '../sla/sla-lectura';
import type { TipoPlazo } from '../sla/vencimientos';
import type { Prioridad } from '../ticket/prioridad';
import type { Pagina } from './ticket-lectura-repository';

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketEscalado {
  id: number;
  numero: string;
  titulo: string;
  estado: 'asignada' | 'en_proceso' | 'en_espera' | 'en_revision';
  prioridad: Prioridad | null;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null;
  tecnico: { id: number; nombre: string } | null;
  escaladoEn: string; // ISO 8601 en UTC
  escaladoPor: TipoPlazo;
  sla: SlaLectura;
}

// Bandeja /escaladas del supervisor (SPEC 32). El alcance de tickets.triage es `todas`.
export interface EscaladasLecturaRepository {
  // Orden escalado_en ASC, id ASC.
  listar(dependenciaId: number | null, pagina: number, tamano: number): Promise<Pagina<TicketEscalado>>;
}
