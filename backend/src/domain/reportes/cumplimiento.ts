import type { EstadoTicket } from '../ticket/estado-ticket';

// Cumplimiento de SLA de cada queja para el tablero (RF-39, SPEC 43). Es la referencia: el repositorio expresa la
// misma tabla con CASE en SQL, y una prueba compara los dos sobre el mismo fixture.
export type ResultadoPlazo = 'cumple' | 'incumple' | 'pendiente' | 'no_aplica';

export interface PlazoRespuesta {
  venceRespuesta: Date | null;
  primeraRespuestaEn: Date | null;
  estado: EstadoTicket;
}

export interface PlazoResolucion {
  venceResolucion: Date | null;
  resueltoEn: Date | null;
  estado: EstadoTicket;
  slaPausadoDesde: Date | null;
  slaRestanteMinutos: number | null;
}

// Sin vencimiento (no aceptada, rechazada en el triage o anterior a SPEC 30) no aplica. Sin primera respuesta, la
// queja ya vencida incumple aunque siga abierta.
export function cumplimientoRespuesta(t: PlazoRespuesta, ahora: Date): ResultadoPlazo {
  if (t.venceRespuesta === null) {
    return 'no_aplica';
  }
  if (t.primeraRespuestaEn !== null) {
    return t.primeraRespuestaEn.getTime() <= t.venceRespuesta.getTime() ? 'cumple' : 'incumple';
  }
  return ahora.getTime() > t.venceRespuesta.getTime() ? 'incumple' : 'pendiente';
}

// Las abiertas ya vencidas incumplen; en espera decide lo que quedaba al pausar (0 = ya había vencido).
export function cumplimientoResolucion(t: PlazoResolucion, ahora: Date): ResultadoPlazo {
  if (t.estado === 'rechazada' || (t.venceResolucion === null && t.slaPausadoDesde === null)) {
    return 'no_aplica';
  }
  if (t.slaPausadoDesde !== null) {
    return (t.slaRestanteMinutos ?? 0) > 0 ? 'pendiente' : 'incumple';
  }
  const vence = t.venceResolucion!.getTime();
  if ((t.estado === 'resuelta' || t.estado === 'cerrada') && t.resueltoEn !== null) {
    return t.resueltoEn.getTime() <= vence ? 'cumple' : 'incumple';
  }
  return ahora.getTime() > vence ? 'incumple' : 'pendiente';
}

// cumple / (cumple + incumple) × 100, con 1 decimal. Las pendientes y las que no aplican no entran; sin medibles,
// null.
export function porcentaje(cumple: number, incumple: number): number | null {
  const medibles = cumple + incumple;
  return medibles === 0 ? null : Math.round((cumple / medibles) * 1000) / 10;
}
