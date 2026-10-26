import { type Detalle, ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';

// Códigos de error de la API. presentation/ los traduce a status HTTP.
export type CodigoError =
  | 'VALIDACION'
  | 'POLITICA_PASSWORD'
  | 'TOKEN_RECUPERACION_INVALIDO'
  | 'TOKEN_VERIFICACION_INVALIDO'
  | 'CORREO_NO_VERIFICADO'
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
  | 'DEFINICION_INVALIDA'
  | 'DATOS_EXTRA_INVALIDOS'
  | 'CAMBIO_INCOMPATIBLE'
  | 'UBICACION_INCOMPLETA'
  | 'UBICACION_INVALIDA'
  | 'UBICACION_NO_CONFIGURADA'
  | 'UBICACION_FUERA_DEL_MUNICIPIO'
  | 'LIMITES_INVALIDOS'
  | 'TECNICO_NO_ELEGIBLE'
  | 'TECNICO_SIN_CAMBIO'
  | 'MOTIVO_REQUERIDO'
  | 'TRASLADO_PENDIENTE'
  | 'TRASLADO_YA_RESUELTO'
  | 'TRASLADO_SIN_EFECTO'
  | 'CUERPO_INVALIDO'
  | 'QUEJA_FINALIZADA'
  | 'EDICION_VENCIDA'
  | 'ADJUNTO_INVALIDO'
  | 'ADJUNTOS_CERRADOS'
  | 'LIMITE_ADJUNTOS'
  | 'CALENDARIO_INCOMPLETO'
  | 'PARAMETRO_INVALIDO'
  | 'ENCUESTA_INVALIDA' // SPEC 39
  | 'ENCUESTA_NO_DISPONIBLE'
  | 'ENCUESTA_VENCIDA'
  | 'ENCUESTA_EXISTENTE'
  | 'PLAZO_NO_DEFINIDO'
  | 'PLAZO_CONFIRMACION_VENCIDO'
  | 'LIMITE_REAPERTURAS'
  | 'MATRIZ_SLA_INVALIDA'
  | 'SLA_NO_CONFIGURADO'
  | 'NO_AUTENTICADO'
  | 'TOKEN_INVALIDO'
  | 'CREDENCIALES_INVALIDAS'
  | 'SESION_INVALIDA'
  | 'PERMISO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'CONSULTA_NO_ENCONTRADA' // SPEC 37: el mismo para un número inexistente y un contacto que no coincide
  | 'CUENTA_BLOQUEADA'
  | 'DEMASIADAS_PETICIONES'
  | 'ERROR_INTERNO';

// Códigos de ReglaDeNegocioError del dominio que la API expone tal cual.
const CODIGOS_DE_REGLA: readonly CodigoError[] = [
  'POLITICA_PASSWORD',
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
  'DEFINICION_INVALIDA',
  'DATOS_EXTRA_INVALIDOS',
  'UBICACION_INCOMPLETA',
  'UBICACION_INVALIDA',
  'UBICACION_NO_CONFIGURADA',
  'UBICACION_FUERA_DEL_MUNICIPIO',
  'LIMITES_INVALIDOS',
  'TECNICO_NO_ELEGIBLE',
  'TECNICO_SIN_CAMBIO',
  'TRASLADO_PENDIENTE',
  'TRASLADO_YA_RESUELTO',
  'CUERPO_INVALIDO',
  'QUEJA_FINALIZADA',
  'EDICION_VENCIDA',
  'ADJUNTO_INVALIDO',
  'ADJUNTOS_CERRADOS',
  'LIMITE_ADJUNTOS',
  'CALENDARIO_INCOMPLETO',
  'PLAZO_CONFIRMACION_VENCIDO',
  'LIMITE_REAPERTURAS',
  'MATRIZ_SLA_INVALIDA',
  'PARAMETRO_INVALIDO',
  'ENCUESTA_INVALIDA',
  'ENCUESTA_NO_DISPONIBLE',
  'ENCUESTA_VENCIDA',
  'ENCUESTA_EXISTENTE',
];

// Error esperado de un caso de uso. El mensaje es para desarrolladores, no para la UI.
// `detalles` lista todos los problemas de un formulario a la vez (SPEC 14).
export class ErrorDeAplicacion extends Error {
  readonly codigo: CodigoError;
  readonly detalles?: Detalle[];

  constructor(codigo: CodigoError, mensaje: string = codigo, detalles?: Detalle[]) {
    super(mensaje);
    this.name = 'ErrorDeAplicacion';
    this.codigo = codigo;
    if (detalles) {
      this.detalles = detalles;
    }
  }
}

// Ejecuta `trabajo` y convierte una regla de negocio conocida del dominio en ErrorDeAplicacion.
export async function conReglasDeNegocio<T>(trabajo: () => Promise<T>): Promise<T> {
  try {
    return await trabajo();
  } catch (error) {
    const codigo = (error as { codigo?: unknown } | null)?.codigo;
    if (error instanceof ReglaDeNegocioError && CODIGOS_DE_REGLA.includes(codigo as CodigoError)) {
      throw new ErrorDeAplicacion(codigo as CodigoError, error.message, error.detalles);
    }
    throw error;
  }
}
