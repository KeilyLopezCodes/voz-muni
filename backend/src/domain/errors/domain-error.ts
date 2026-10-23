// Base de los errores de negocio. La presentación los traduce a HTTP por su `codigo`.
export abstract class DomainError extends Error {
  readonly codigo: string;

  protected constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}
