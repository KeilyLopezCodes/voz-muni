import type { SlaLectura } from '../sla/vencimientos';
import type { FiltroTickets, TicketAlcance } from '../autorizacion/alcance-tickets';
import type { Busqueda } from '../ticket/busqueda';
import type { Encuesta } from './encuesta-repository';
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
  confirmacionVenceEn: Date | null; // solo en resuelta (SPEC 38)
  // Para decidir pendienteCalificar (SPEC 39); el servicio no los expone.
  cerradoEn: Date | null;
  tieneEncuesta: boolean;
  solicitanteId: number;
}

// Filtros del listado (RF-36, SPEC 38): estados genéricos y una búsqueda. Los grupos del vecino viven en el frontend.
export interface CriteriosListado {
  estados: readonly EstadoTicket[]; // vacío: sin filtro
  busqueda: Busqueda | null;
}

// Resolución vigente (SPEC 26). Solo existe en resuelta o cerrada.
export interface ResolucionLectura {
  descripcion: string;
  resueltaEn: Date;
  resueltaPor: { id: number; nombre: string } | null; // null si tickets.resuelto_por es NULL
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
  cierreAutomatico: boolean; // cerrada y la última transición a cerrada la hizo el sistema (SPEC 33)
  resolucion: ResolucionLectura | null; // solo en resuelta o cerrada (SPEC 26)
  confirmacionVenceEn: Date | null; // fin del plazo para confirmar o reabrir (SPEC 27)
  reaperturas: number;
  solicitanteId: number;
  sla: SlaLectura; // vencimientos (SPEC 30)
  encuesta: Encuesta | null; // SPEC 39
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
  // Mismo filtro que listar, más los criterios. Primero lo que pide acción: en_espera, después resuelta con el plazo de
  // confirmación vigente en `ahora`, después el resto; dentro de cada grupo, creado_en DESC e id DESC (SPEC 38).
  listarConTitulo(
    filtro: FiltroTickets,
    criterios: CriteriosListado,
    pagina: number,
    tamano: number,
    ahora: Date,
  ): Promise<Pagina<TicketListado>>;
  // Cuántas quejas hay en cada estado dentro del mismo alcance y con la misma búsqueda (SPEC 38). Los 8 estados.
  contarPorEstado(filtro: FiltroTickets, busqueda: Busqueda | null): Promise<Record<EstadoTicket, number>>;
  // Filtro en el mismo WHERE que el id, como obtener.
  obtenerDetalle(id: number, filtro: FiltroTickets): Promise<TicketDetalleLectura | null>;
}
