import type { TipoPlazo } from '../ticket/ticket';

// Escalamiento al vencer el SLA (RF-29, SPEC 32). Se usa dentro de una Transaccion.

export interface EscalamientoPendiente {
  ticketId: number;
  plazo: TipoPlazo; // si vencieron los dos, el que venció primero
  vence: Date;
}

export interface EscalamientoRepository {
  // SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` quejas sin escalar, en asignada, en_proceso, en_espera o
  // en_revision, con vence_respuesta <= ahora sin primera respuesta, o con vence_resolucion <= ahora.
  reclamarPendientes(ahora: Date, limite: number): Promise<EscalamientoPendiente[]>;
}
