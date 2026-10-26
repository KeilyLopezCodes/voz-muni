import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { SlaLectura } from '../sla/vencimientos';
import type { Prioridad } from '../ticket/prioridad';
import type { ESTADOS_ABIERTOS } from './asignacion-repository';
import type { Pagina } from './ticket-lectura-repository';

// sin_tecnico: asignada y sin técnico. abiertas: asignada, en_proceso o en_espera, con o sin técnico.
export const VISTAS_POR_ASIGNAR = ['sin_tecnico', 'abiertas'] as const;

export type VistaPorAsignar = (typeof VISTAS_POR_ASIGNAR)[number];

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketPorAsignar {
  id: number;
  numero: string;
  estado: (typeof ESTADOS_ABIERTOS)[number];
  prioridad: Prioridad;
  titulo: string;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  tecnico: { id: number; nombre: string } | null;
  creadoEn: Date;
  sla: SlaLectura; // vencimientos (SPEC 30)
}

// Bandeja de asignación (SPEC 20), siempre filtrada por alcance (SPEC 11). Un filtro null no consulta la base.
export interface PorAsignarLecturaRepository {
  // Ordenada por prioridad (urgente, alta, media, baja), luego creado_en ASC e id ASC.
  listar(
    filtro: FiltroTickets,
    vista: VistaPorAsignar,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketPorAsignar>>;
}
