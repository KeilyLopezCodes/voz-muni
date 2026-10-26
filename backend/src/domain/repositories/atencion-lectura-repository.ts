import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { DatosExtra } from '../categorias/datos-extra';
import type { SlaLectura } from '../sla/vencimientos';
import type { Prioridad } from '../ticket/prioridad';
import type { ESTADOS_ABIERTOS } from './asignacion-repository';
import type { Pagina } from './ticket-lectura-repository';

export type EstadoAtencion = (typeof ESTADOS_ABIERTOS)[number];

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketAtencion {
  id: number;
  numero: string;
  estado: EstadoAtencion;
  prioridad: Prioridad;
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  datosExtra: DatosExtra;
  ubicacion: { lat: number; lng: number } | null;
  tecnico: { id: number; nombre: string } | null;
  motivoEspera: string | null; // motivo de la última transición a en_espera, solo si está en espera
  trasladoPendiente: boolean; // hay una solicitud de traslado pendiente (SPEC 21)
  creadoEn: Date;
  sla: SlaLectura; // vencimientos (SPEC 30)
}

// Bandeja de atención (SPEC 22), siempre filtrada por alcance (SPEC 11). Un filtro null no consulta la base.
export interface AtencionLecturaRepository {
  // Ordenada por prioridad (urgente, alta, media, baja), luego creado_en ASC e id ASC.
  listar(
    filtro: FiltroTickets,
    estados: readonly EstadoAtencion[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketAtencion>>;
}
