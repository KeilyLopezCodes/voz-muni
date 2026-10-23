import { DomainError } from './domain-error';

// Falta un dato o no se cumple una condición; el `codigo` identifica cuál (SPEC 04).
export class ReglaDeNegocioError extends DomainError {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje);
  }
}
