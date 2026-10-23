import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { type CodigoError, ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';

const STATUS_POR_CODIGO: Record<CodigoError, number> = {
  VALIDACION: 400,
  POLITICA_PASSWORD: 400,
  TOKEN_RECUPERACION_INVALIDO: 400,
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
  NO_AUTENTICADO: 401,
  TOKEN_INVALIDO: 401,
  CREDENCIALES_INVALIDAS: 401,
  SESION_INVALIDA: 401,
  PERMISO_DENEGADO: 403,
  NO_ENCONTRADO: 404,
  CUENTA_BLOQUEADA: 423,
  DEMASIADAS_PETICIONES: 429,
  ERROR_INTERNO: 500,
};

// Ruta desconocida bajo /api/v1: se monta después de todas las rutas de la API.
export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(new ErrorDeAplicacion('NO_ENCONTRADO', `No existe ${req.method} ${req.originalUrl}`));
};

// Último middleware de app.ts. Todo error sale como { codigo, mensaje }, el formato que lee el cliente HTTP.
export const manejadorErrores: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ErrorDeAplicacion) {
    res.status(STATUS_POR_CODIGO[error.codigo]).json({ codigo: error.codigo, mensaje: error.message });
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

  // La traza queda en el log del servidor, nunca en la respuesta.
  console.error(error);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno' });
};
