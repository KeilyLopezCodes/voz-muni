// Mismos valores que el CHECK de prioridad de SPEC 03.
export const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;

export type Prioridad = (typeof PRIORIDADES)[number];

export function esPrioridad(valor: unknown): valor is Prioridad {
  return typeof valor === 'string' && (PRIORIDADES as readonly string[]).includes(valor);
}
