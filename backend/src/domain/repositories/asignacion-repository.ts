import type { RegistroAsignacion, TecnicoCandidato } from '../asignacion/asignacion-tecnico';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Estados que cuentan como carga de un técnico (SPEC 20).
export const ESTADOS_ABIERTOS = ['asignada', 'en_proceso', 'en_espera'] as const satisfies readonly EstadoTicket[];

export interface TecnicoConCarga {
  id: number;
  nombre: string;
  carga: number; // tickets con asignado_a = id en asignada, en_proceso o en_espera
}

// Asignaciones de técnico (SPEC 20). Se usa dentro de una Transaccion.
export interface AsignacionRepository {
  // Cualquier usuario por id, con su rol: la regla de elegibilidad la aplica el dominio. null si no existe.
  obtenerCandidato(usuarioId: number): Promise<TecnicoCandidato | null>;
  // Inserta una fila en ticket_asignaciones (solo de inserción).
  registrar(registro: RegistroAsignacion): Promise<void>;
  // Técnicos activos de la dependencia, ordenados por carga y luego por nombre.
  tecnicosConCarga(dependenciaId: number): Promise<TecnicoConCarga[]>;
}
