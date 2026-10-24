// Calendario laboral municipal (calendario_laboral, SPEC 03 y 05). Lo usa el plazo de confirmación (SPEC 27) y
// podrá usarlo el cálculo del SLA (RF-27).
export interface CalendarioRepository {
  // Hasta `cantidad` fechas (YYYY-MM-DD) con es_habil = true y fecha > desde, en orden ascendente.
  diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]>;
  // Hasta `cantidad` fechas hábiles con fecha >= desde (incluye el día de inicio), en orden (SPEC 30).
  diasHabilesDesde(desde: string, cantidad: number): Promise<string[]>;
  // Todas las fechas hábiles en [desde, hasta], en orden.
  diasHabilesEntre(desde: string, hasta: string): Promise<string[]>;
}
