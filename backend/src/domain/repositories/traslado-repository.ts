import type { Rol } from '../auth/roles';
import type { EstadoTicket } from '../ticket/estado-ticket';
import type { EstadoSolicitud } from '../traslado/solicitud-traslado';
import type { Pagina } from './ticket-lectura-repository';

export interface NuevaSolicitudTraslado {
  ticketId: number;
  solicitadoPor: number;
  dependenciaOrigenId: number;
  dependenciaSugeridaId: number | null;
  motivo: string;
  // El traslado directo del supervisor nace ya aprobado (SPEC 21).
  resolucion: { estado: 'aprobada'; resueltoPor: number; resueltoEn: Date } | null;
}

// Lo que hace falta para decidir sobre una solicitud bloqueada.
export interface SolicitudBloqueada {
  id: number;
  ticketId: number;
  estado: EstadoSolicitud;
  motivo: string;
  solicitadoPor: number;
}

export interface Resolucion {
  estado: Exclude<EstadoSolicitud, 'pendiente'>;
  resueltoPor: number;
  motivoResolucion: string | null;
  resueltoEn: Date;
}

export interface SolicitudTraslado {
  id: number;
  estado: EstadoSolicitud;
  motivo: string;
  ticket: { id: number; numero: string; titulo: string; estado: EstadoTicket };
  dependenciaOrigen: { id: number; nombre: string };
  dependenciaSugerida: { id: number; nombre: string } | null;
  solicitadoPor: { id: number; nombre: string; rol: Rol };
  resueltoPor: { id: number; nombre: string } | null;
  motivoResolucion: string | null;
  creadoEn: Date;
  resueltoEn: Date | null;
}

// Solicitudes de traslado (SPEC 21). Se usa dentro de una Transaccion.
export interface TrasladoRepository {
  // Lanza ReglaDeNegocioError TRASLADO_PENDIENTE si la queja ya tiene una pendiente (índice único parcial).
  crear(solicitud: NuevaSolicitudTraslado): Promise<number>;
  // SELECT … FOR UPDATE: dos decisiones sobre la misma solicitud se aplican una después de la otra.
  obtenerParaActualizar(id: number): Promise<SolicitudBloqueada | null>;
  resolver(id: number, resolucion: Resolucion): Promise<void>;
  obtener(id: number): Promise<SolicitudTraslado | null>;
  // Ordenadas por creado_en ASC y luego id ASC.
  listar(estado: EstadoSolicitud, pagina: number, tamano: number): Promise<Pagina<SolicitudTraslado>>;
  dependenciaActiva(dependenciaId: number): Promise<boolean>;
}
