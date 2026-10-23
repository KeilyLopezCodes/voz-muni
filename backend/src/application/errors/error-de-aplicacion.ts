import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';

// Códigos de error de la API. presentation/ los traduce a status HTTP.
export type CodigoError =
  | 'VALIDACION'
  | 'POLITICA_PASSWORD'
  | 'TOKEN_RECUPERACION_INVALIDO'
  | 'ROL_NO_PERMITIDO'
  | 'DEPENDENCIA_REQUERIDA'
  | 'DEPENDENCIA_NO_PERMITIDA'
  | 'DEPENDENCIA_INVALIDA'
  | 'DPI_INVALIDO'
  | 'EMAIL_DUPLICADO'
  | 'DPI_DUPLICADO'
  | 'OPERACION_SOBRE_SI_MISMO'
  | 'ULTIMO_ADMINISTRADOR'
  | 'TITULO_INVALIDO'
  | 'DESCRIPCION_INVALIDA'
  | 'DIRECCION_INVALIDA'
  | 'DATO_INVALIDO'
  | 'SOLICITANTE_INVALIDO'
  | 'CATEGORIA_INVALIDA'
  | 'ZONA_INVALIDA'
  | 'CORRELATIVO_AGOTADO'
  | 'NOMBRE_INVALIDO'
  | 'TELEFONO_INVALIDO'
  | 'EMAIL_INVALIDO'
  | 'CONTACTO_REQUERIDO'
  | 'NO_AUTENTICADO'
  | 'TOKEN_INVALIDO'
  | 'CREDENCIALES_INVALIDAS'
  | 'SESION_INVALIDA'
  | 'PERMISO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'CUENTA_BLOQUEADA'
  | 'DEMASIADAS_PETICIONES'
  | 'ERROR_INTERNO';

// Códigos de ReglaDeNegocioError del dominio que la API expone tal cual.
const CODIGOS_DE_REGLA: readonly CodigoError[] = [
  'DEPENDENCIA_REQUERIDA',
  'DEPENDENCIA_NO_PERMITIDA',
  'DPI_INVALIDO',
  'EMAIL_DUPLICADO',
  'DPI_DUPLICADO',
  'OPERACION_SOBRE_SI_MISMO',
  'ULTIMO_ADMINISTRADOR',
  'TITULO_INVALIDO',
  'DESCRIPCION_INVALIDA',
  'DIRECCION_INVALIDA',
  'DATO_INVALIDO',
  'CORRELATIVO_AGOTADO',
  'NOMBRE_INVALIDO',
  'TELEFONO_INVALIDO',
  'EMAIL_INVALIDO',
  'CONTACTO_REQUERIDO',
];

// Error esperado de un caso de uso. El mensaje es para desarrolladores, no para la UI.
export class ErrorDeAplicacion extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string = codigo) {
    super(mensaje);
    this.name = 'ErrorDeAplicacion';
    this.codigo = codigo;
  }
}

// Ejecuta `trabajo` y convierte una regla de negocio conocida del dominio en ErrorDeAplicacion.
export async function conReglasDeNegocio<T>(trabajo: () => Promise<T>): Promise<T> {
  try {
    return await trabajo();
  } catch (error) {
    const codigo = (error as { codigo?: unknown } | null)?.codigo;
    if (error instanceof ReglaDeNegocioError && CODIGOS_DE_REGLA.includes(codigo as CodigoError)) {
      throw new ErrorDeAplicacion(codigo as CodigoError, error.message);
    }
    throw error;
  }
}
