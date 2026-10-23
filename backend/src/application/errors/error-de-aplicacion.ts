// Códigos de error de la API. presentation/ los traduce a status HTTP.
export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTENTICADO'
  | 'TOKEN_INVALIDO'
  | 'CREDENCIALES_INVALIDAS'
  | 'SESION_INVALIDA'
  | 'PERMISO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'CUENTA_BLOQUEADA'
  | 'DEMASIADAS_PETICIONES'
  | 'ERROR_INTERNO';

// Error esperado de un caso de uso. El mensaje es para desarrolladores, no para la UI.
export class ErrorDeAplicacion extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string = codigo) {
    super(mensaje);
    this.name = 'ErrorDeAplicacion';
    this.codigo = codigo;
  }
}
