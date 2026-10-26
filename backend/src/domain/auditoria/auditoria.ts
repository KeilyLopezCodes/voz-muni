import type { AccionBitacora } from './acciones';
import type { Cambios } from './saneamiento';

// Un hecho para la bitácora (RF-42, SPEC 41). La entidad sale del catálogo de acciones.
export interface EventoAuditoria {
  accion: AccionBitacora;
  entidadId: string | number | null;
  usuarioId: number | null; // null = sistema (los jobs)
  dependenciaId: number | null; // la del momento: así un traslado posterior no cambia lo que vio el coordinador
  cambios?: Cambios;
  datos?: Record<string, unknown>;
}

// Puerto de escritura de la bitácora. Se usa dentro de la Transaccion del caso de uso (`auditoria` en
// ReposTransaccionales): si la transacción se revierte no queda registro, y si el registro falla se revierte la
// acción. Valida la acción contra el catálogo, sanea el detalle y toma la IP del contexto de la solicitud.
export interface Auditoria {
  registrar(evento: EventoAuditoria): Promise<void>;
}
