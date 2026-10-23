import { DomainError } from './domain-error';

// Un problema concreto dentro de una regla que valida varios datos a la vez (SPEC 14).
export interface DetalleProblema {
  campo: string;
  problema: string;
}

// Falta un dato o no se cumple una condición; el `codigo` identifica cuál (SPEC 04).
// `detalles` lista todos los problemas cuando la regla revisa varios campos juntos.
export class ReglaDeNegocioError extends DomainError {
  readonly detalles?: DetalleProblema[];

  constructor(codigo: string, mensaje: string, detalles?: DetalleProblema[]) {
    super(codigo, mensaje);
    if (detalles) {
      this.detalles = detalles;
    }
  }
}
