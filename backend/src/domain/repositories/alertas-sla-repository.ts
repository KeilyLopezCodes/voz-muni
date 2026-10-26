// Alertas al umbral del plazo (RF-28, SPEC 31). Se usa dentro de una Transaccion.

export type PlazoAlerta = 'respuesta' | 'resolucion';

export interface AlertaPendiente {
  ticketId: number;
  plazo: PlazoAlerta;
  vence: Date; // vence_respuesta o vence_resolucion
  dependenciaId: number;
  asignadoA: number | null;
}

export interface AlertasSlaRepository {
  // SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` alertas con su instante <= ahora y sin enviar, de quejas en
  // asignada o en_proceso (la de respuesta, solo sin primera respuesta). Otra transacción que corra a la vez salta
  // las filas bloqueadas: una alerta nunca se envía dos veces.
  reclamarPendientes(ahora: Date, limite: number): Promise<AlertaPendiente[]>;
  marcarEnviada(ticketId: number, plazo: PlazoAlerta, ahora: Date): Promise<void>;
}
