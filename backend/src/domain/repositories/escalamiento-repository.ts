import type { Accion } from '../auth/permisos';
import type { TipoPlazo } from '../ticket/ticket';

// Escalamiento al vencer el SLA (RF-29, SPEC 32). Se usa dentro de una Transaccion.

export interface EscalamientoPendiente {
  ticketId: number;
  plazo: TipoPlazo; // si vencieron los dos, el que venció primero
  vence: Date;
}

// Quién atiende los escalamientos: los roles con esta acción, con cualquier alcance (hoy, el supervisor). La regla
// depende de la acción, no del nombre del rol; tickets.ver = 'todas' incluiría también al administrador.
export const ACCION_ESCALAMIENTO: Accion = 'tickets.triage';

export interface EscalamientoRepository {
  // SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` quejas sin escalar, en asignada, en_proceso, en_espera o
  // en_revision, con vence_respuesta <= ahora sin primera respuesta, o con vence_resolucion <= ahora.
  reclamarPendientes(ahora: Date, limite: number): Promise<EscalamientoPendiente[]>;
  // Usuarios activos cuyo rol tiene ACCION_ESCALAMIENTO.
  supervisores(): Promise<number[]>;
}
