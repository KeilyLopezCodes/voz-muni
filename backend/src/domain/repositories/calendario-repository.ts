// Calendario laboral municipal (calendario_laboral, SPEC 03 y 05). Lo usan el plazo de confirmación (SPEC 27) y
// el cálculo del SLA (SPEC 30). Las fechas son YYYY-MM-DD, en orden ascendente.
export interface CalendarioRepository {
  // Hasta `cantidad` fechas con es_habil = true y fecha > desde (SPEC 27).
  diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]>;
  // Hasta `cantidad` fechas con es_habil = true y fecha >= desde (incluye el día de inicio).
  diasHabilesDesde(desde: string, cantidad: number): Promise<string[]>;
  // Todas las fechas hábiles en [desde, hasta]. Lanza CALENDARIO_INCOMPLETO si falta alguna fila del rango.
  diasHabilesEntre(desde: string, hasta: string): Promise<string[]>;
}
