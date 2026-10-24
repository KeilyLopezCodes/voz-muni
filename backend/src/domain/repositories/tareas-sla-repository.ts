import type { TipoPlazo } from '../sla/vencimientos';

export interface AlertaPendiente {
  ticketId: number;
  plazo: TipoPlazo;
  vence: Date;
  dependenciaId: number | null;
  asignadoA: number | null;
}

export interface EscalamientoPendiente {
  ticketId: number;
  plazo: TipoPlazo;
  vence: Date;
}

// Reclamo de las tareas del job de SLA (SPEC 31, 32 y 33). Todo se usa dentro de una Transaccion y con
// FOR UPDATE SKIP LOCKED: dos instancias o dos corridas solapadas nunca procesan la misma queja dos veces.
export interface TareasSlaRepository {
  // Alertas al umbral: alerta_*_en <= ahora, sin enviar, en asignada o en_proceso (la de respuesta, sin primera respuesta).
  reclamarAlertas(ahora: Date, limite: number): Promise<AlertaPendiente[]>;
  marcarAlertaEnviada(ticketId: number, plazo: TipoPlazo, ahora: Date): Promise<void>;
  // Quejas activas sin escalar con un plazo vencido. Si vencieron los dos, el plazo es el más antiguo.
  reclamarEscalamientos(ahora: Date, limite: number): Promise<EscalamientoPendiente[]>;
  // Quejas en resuelta con confirmacion_vence_en < ahora (estricto).
  reclamarCierres(ahora: Date, limite: number): Promise<number[]>;
  contarResueltasSinPlazo(): Promise<number>;
}
