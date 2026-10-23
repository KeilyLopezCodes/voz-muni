// Filtro de alcance (RF-05, SPEC 11): qué registros puede leer o tocar un usuario.
// El dominio no conoce SQL; los repositorios lo traducen a WHERE.

// Condición sobre un campo del registro: campo = valor.
export interface Condicion<C extends string> {
  readonly campo: C;
  readonly valor: number;
}

// null = ningún registro. Lista vacía = todos. Varias condiciones = todas a la vez (AND).
export type Filtro<C extends string> = readonly Condicion<C>[] | null;

// null si alguno es null; si no, todas las condiciones de ambos.
export function intersectar<C extends string>(a: Filtro<C>, b: Filtro<C>): Filtro<C> {
  if (a === null || b === null) {
    return null;
  }
  return [...a, ...b];
}
