import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { SlaLectura } from '../sla/vencimientos';
import type { Busqueda } from '../ticket/busqueda';
import type { EstadoTicket } from '../ticket/estado-ticket';
import type { Prioridad } from '../ticket/prioridad';
import type { Pagina } from './ticket-lectura-repository';

// Estados abiertos del listado de gestión (SPEC 45): van antes que las finalizadas (resuelta, cerrada y rechazada).
export const ESTADOS_ABIERTOS_GESTION = ['nueva', 'en_revision', 'asignada', 'en_proceso', 'en_espera'] as const;

// Fila de GET /api/v1/tickets/gestion. Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketGestion {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  prioridad: Prioridad | null; // null en nueva y en_revision
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null;
  zona: { id: number; nombre: string };
  tecnico: { id: number; nombre: string } | null;
  creadoEn: Date;
  sla: SlaLectura;
}

// Se combinan con AND y se intersecan con el filtro de alcance: un id fuera del alcance da una lista vacía.
export interface CriteriosGestion {
  estados: readonly EstadoTicket[]; // vacío: sin filtro
  busqueda: Busqueda | null;
  dependenciaId: number | null;
  categoriaId: number | null;
  prioridad: Prioridad | null;
  inicio: Date | null; // creado_en >= inicio
  fin: Date | null; // creado_en < fin
  tecnico: number | 'sin_asignar' | null;
}

// Qué opciones de filtro ve el usuario según su alcance de tickets.ver. null: ninguna, sin consultar la base.
export type FiltroOpciones = { dependencias: 'todas' | number; tecnicos: boolean } | null;

export interface OpcionesGestion {
  dependencias: { id: number; nombre: string; activa: boolean }[];
  categorias: { id: number; nombre: string; dependenciaId: number; activa: boolean }[];
  tecnicos: { id: number; nombre: string; dependenciaId: number; activo: boolean }[];
}

// Listado general de quejas para los internos (SPEC 45), siempre filtrado por alcance (SPEC 11). Un filtro null no
// consulta la base.
export interface GestionLecturaRepository {
  // Orden fijo: abiertas escaladas, las demás abiertas (las dos por prioridad, creado_en ASC e id ASC) y al final
  // las finalizadas por creado_en DESC e id DESC.
  listar(filtro: FiltroTickets, criterios: CriteriosGestion, pagina: number, tamano: number): Promise<Pagina<TicketGestion>>;
  // Incluye las inactivas; cada lista ordenada por nombre.
  opciones(filtro: FiltroOpciones): Promise<OpcionesGestion>;
}
