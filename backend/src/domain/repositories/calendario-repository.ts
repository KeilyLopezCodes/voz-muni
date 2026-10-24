// Calendario laboral municipal (calendario_laboral, SPEC 03 y 05). Lo usa el plazo de confirmación (SPEC 27) y
// podrá usarlo el cálculo del SLA (RF-27).
export interface CalendarioRepository {
  // Hasta `cantidad` fechas (YYYY-MM-DD) con es_habil = true y fecha > desde, en orden ascendente.
  diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]>;
}
