// Cierre automático de quejas resueltas (RF-30, SPEC 33). `reclamarVencidas` se usa dentro de una Transaccion.
export interface CierreAutomaticoRepository {
  // SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` ids con estado = 'resuelta' AND confirmacion_vence_en < ahora.
  // Estricto: en el instante exacto del vencimiento el plazo sigue vigente (SPEC 04 y 27).
  reclamarVencidas(ahora: Date, limite: number): Promise<number[]>;
  // Quejas en resuelta sin confirmacion_vence_en: nunca se cierran, solo se informan.
  contarSinPlazo(): Promise<number>;
}
