import { DomainError } from './domain-error';

// Un problema concreto dentro de una regla que valida varios datos a la vez (SPEC 14).
export interface DetalleProblema {
  campo: string;
  problema: string;
}

// Un problema en una fila de una matriz (SPEC 29): además del campo, la fila donde ocurre. `campo` es null si el
// problema es de la fila entera.
export interface DetalleDeFila {
  prioridad: string;
  campo: string | null;
  problema: string;
}

// Un registro que impide la operación (SPEC 40): por ejemplo, las categorías activas de una dependencia.
export interface DetalleRegistro {
  id: number;
  nombre: string;
}

export type Detalle = DetalleProblema | DetalleDeFila | DetalleRegistro;

// Falta un dato o no se cumple una condición; el `codigo` identifica cuál (SPEC 04).
// `detalles` lista todos los problemas cuando la regla revisa varios campos juntos.
export class ReglaDeNegocioError extends DomainError {
  readonly detalles?: Detalle[];

  constructor(codigo: string, mensaje: string, detalles?: Detalle[]) {
    super(codigo, mensaje);
    if (detalles) {
      this.detalles = detalles;
    }
  }
}
