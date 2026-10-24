import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { DatosExtra } from '../categorias/datos-extra';
import type { Pagina } from './ticket-lectura-repository';

export const ESTADOS_TRIAGE = ['nueva', 'en_revision'] as const;

export type EstadoTriage = (typeof ESTADOS_TRIAGE)[number];

// Lo que el supervisor necesita para decidir. Del solicitante solo el nombre (RNF-12).
export interface TicketTriage {
  id: number;
  numero: string;
  estado: EstadoTriage;
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  canal: string;
  datosExtra: DatosExtra;
  ubicacion: { lat: number; lng: number } | null;
  solicitanteNombre: string;
  creadoEn: Date;
}

// Bandeja del triage (SPEC 19), siempre filtrada por alcance (SPEC 11). Un filtro null no consulta la base.
export interface TriageLecturaRepository {
  // Solo los estados pedidos, ordenados por creado_en ASC y luego id ASC.
  listar(
    filtro: FiltroTickets,
    estados: readonly EstadoTriage[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketTriage>>;
}
