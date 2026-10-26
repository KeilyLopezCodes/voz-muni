import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { type CodigoError, ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';
import { InvalidTransitionError } from '../../domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';

const STATUS_POR_CODIGO: Record<CodigoError, number> = {
  VALIDACION: 400,
  POLITICA_PASSWORD: 400,
  TOKEN_RECUPERACION_INVALIDO: 400,
  TOKEN_VERIFICACION_INVALIDO: 400,
  CORREO_NO_VERIFICADO: 403,
  ROL_NO_PERMITIDO: 400,
  DEPENDENCIA_REQUERIDA: 400,
  DEPENDENCIA_NO_PERMITIDA: 400,
  DEPENDENCIA_INVALIDA: 400,
  DPI_INVALIDO: 400,
  EMAIL_DUPLICADO: 409,
  DPI_DUPLICADO: 409,
  OPERACION_SOBRE_SI_MISMO: 409,
  ULTIMO_ADMINISTRADOR: 409,
  TITULO_INVALIDO: 400,
  DESCRIPCION_INVALIDA: 400,
  DIRECCION_INVALIDA: 400,
  DATO_INVALIDO: 400,
  SOLICITANTE_INVALIDO: 400,
  CATEGORIA_INVALIDA: 400,
  ZONA_INVALIDA: 400,
  CORRELATIVO_AGOTADO: 500,
  NOMBRE_INVALIDO: 400,
  TELEFONO_INVALIDO: 400,
  EMAIL_INVALIDO: 400,
  CONTACTO_REQUERIDO: 400,
  DEFINICION_INVALIDA: 400,
  DATOS_EXTRA_INVALIDOS: 400,
  CAMBIO_INCOMPATIBLE: 409,
  UBICACION_INCOMPLETA: 400,
  UBICACION_INVALIDA: 400,
  UBICACION_NO_CONFIGURADA: 400,
  UBICACION_FUERA_DEL_MUNICIPIO: 400,
  LIMITES_INVALIDOS: 400,
  TECNICO_NO_ELEGIBLE: 400,
  TECNICO_SIN_CAMBIO: 400,
  MOTIVO_REQUERIDO: 400,
  TRASLADO_PENDIENTE: 409,
  TRASLADO_YA_RESUELTO: 409,
  TRASLADO_SIN_EFECTO: 409,
  CUERPO_INVALIDO: 400,
  QUEJA_FINALIZADA: 409,
  EDICION_VENCIDA: 409,
  ADJUNTO_INVALIDO: 400,
  ADJUNTOS_CERRADOS: 409,
  LIMITE_ADJUNTOS: 409,
  CALENDARIO_INCOMPLETO: 409,
  PARAMETRO_INVALIDO: 409,
  ENCUESTA_INVALIDA: 400,
  ENCUESTA_NO_DISPONIBLE: 409,
  ENCUESTA_VENCIDA: 409,
  ENCUESTA_EXISTENTE: 409,
  NOMBRE_DUPLICADO: 409,
  DEPENDENCIA_EN_USO: 409,
  DEPENDENCIA_INACTIVA: 409,
  SLA_INCOMPLETO: 409,
  PLAZO_NO_DEFINIDO: 409,
  PLAZO_CONFIRMACION_VENCIDO: 409,
  LIMITE_REAPERTURAS: 409,
  MATRIZ_SLA_INVALIDA: 400,
  SLA_NO_CONFIGURADO: 409,
  RANGO_INVALIDO: 400,
  NO_AUTENTICADO: 401,
  TOKEN_INVALIDO: 401,
  CREDENCIALES_INVALIDAS: 401,
  SESION_INVALIDA: 401,
  PERMISO_DENEGADO: 403,
  NO_ENCONTRADO: 404,
  CONSULTA_NO_ENCONTRADA: 404,
  CUENTA_BLOQUEADA: 423,
  DEMASIADAS_PETICIONES: 429,
  ERROR_INTERNO: 500,
};

// La query de /api/v1/public lleva el contacto del solicitante (SPEC 37): no se escribe en logs ni mensajes.
const RUTAS_PUBLICAS = '/api/v1/public';

export function esRutaPublica(url: string): boolean {
  return url === RUTAS_PUBLICAS || url.startsWith(`${RUTAS_PUBLICAS}/`) || url.startsWith(`${RUTAS_PUBLICAS}?`);
}

// La URL sin la query cuando es pública.
const urlParaMostrar = (url: string) => (esRutaPublica(url) ? url.split('?')[0] : url);

// Ruta desconocida bajo /api/v1: se monta después de todas las rutas de la API.
export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(new ErrorDeAplicacion('NO_ENCONTRADO', `No existe ${req.method} ${urlParaMostrar(req.originalUrl)}`));
};

// Último middleware de app.ts. Todo error sale como { codigo, mensaje }, el formato que lee el cliente HTTP.
export const manejadorErrores: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ErrorDeAplicacion) {
    // `detalles` solo aparece en los errores que lo traen (SPEC 14); el resto conserva { codigo, mensaje }.
    const detalles = error.detalles ? { detalles: error.detalles } : {};
    res.status(STATUS_POR_CODIGO[error.codigo]).json({ codigo: error.codigo, mensaje: error.message, ...detalles });
    return;
  }

  // Errores del dominio que ningún servicio tradujo (SPEC 19): valen para cualquier endpoint.
  if (error instanceof InvalidTransitionError) {
    res.status(409).json({ codigo: 'TRANSICION_INVALIDA', mensaje: error.message });
    return;
  }
  if (error instanceof ReglaDeNegocioError) {
    const detalles = error.detalles ? { detalles: error.detalles } : {};
    res.status(400).json({ codigo: error.codigo, mensaje: error.message, ...detalles });
    return;
  }

  // Los límites de Multer en la subida de adjuntos (SPEC 24): un archivo de más de 10 MB es ADJUNTO_INVALIDO;
  // demasiados archivos o un campo inesperado, VALIDACION.
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        codigo: 'ADJUNTO_INVALIDO',
        mensaje: 'El archivo supera los 10 MB',
        detalles: [{ campo: error.field ?? 'archivos', problema: 'MUY_GRANDE' }],
      });
      return;
    }
    res.status(400).json({ codigo: 'VALIDACION', mensaje: `Subida inválida: ${error.code}` });
    return;
  }

  if (error instanceof ZodError) {
    const detalle = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    res.status(400).json({ codigo: 'VALIDACION', mensaje: detalle });
    return;
  }

  // express.json() marca así el cuerpo que no es JSON válido.
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ codigo: 'VALIDACION', mensaje: 'El cuerpo no es JSON válido' });
    return;
  }

  // La traza queda en el log del servidor, nunca en la respuesta. En las rutas públicas ni siquiera el mensaje: puede
  // traer el contacto (por ejemplo, un error de la base con los valores de la consulta). Solo el tipo y la ruta.
  if (esRutaPublica(req.originalUrl)) {
    console.error(`Error interno en ${req.method} ${urlParaMostrar(req.originalUrl)}: ${error?.name ?? 'Error'}`);
  } else {
    console.error(error);
  }
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno' });
};
