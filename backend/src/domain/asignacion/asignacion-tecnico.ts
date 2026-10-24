import type { Rol } from '../auth/roles';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Asignación de técnico (RF-14, SPEC 20). El cambio de asignado_a lo hace Ticket.asignarTecnico (SPEC 04),
// que ya valida el estado; aquí van las reglas de quién puede ser el técnico.

export interface TecnicoCandidato {
  id: number;
  rol: Rol;
  activo: boolean;
  dependenciaId: number | null;
}

export interface DatosAsignacion {
  ticketDependenciaId: number | null;
  tecnicoActual: number | null;
  candidato: TecnicoCandidato;
  motivo: string | undefined;
}

// Una fila de ticket_asignaciones (solo de inserción).
export interface RegistroAsignacion {
  ticketId: number;
  tecnicoAnterior: number | null;
  tecnicoNuevo: number;
  asignadoPor: number;
  motivo: string | null;
  creadoEn: Date;
}

// Solo un técnico activo de la dependencia del ticket, también para el supervisor: otra dependencia exige un
// traslado (RF-15). El motivo es obligatorio al reasignar y opcional en la primera asignación.
// Devuelve el motivo recortado, o null si no hay.
export function validarAsignacion({ ticketDependenciaId, tecnicoActual, candidato, motivo }: DatosAsignacion): {
  motivo: string | null;
} {
  if (
    candidato.rol !== 'tecnico' ||
    !candidato.activo ||
    ticketDependenciaId === null ||
    candidato.dependenciaId !== ticketDependenciaId
  ) {
    throw new ReglaDeNegocioError('TECNICO_NO_ELEGIBLE', 'El técnico debe estar activo y ser de la dependencia del ticket');
  }
  if (candidato.id === tecnicoActual) {
    throw new ReglaDeNegocioError('TECNICO_SIN_CAMBIO', 'Ese técnico ya está asignado');
  }
  const recortado = typeof motivo === 'string' ? motivo.trim() : '';
  if (tecnicoActual !== null && recortado === '') {
    throw new ReglaDeNegocioError('MOTIVO_REQUERIDO', 'El motivo es obligatorio al reasignar');
  }
  return { motivo: recortado === '' ? null : recortado };
}
