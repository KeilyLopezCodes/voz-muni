import type { RequestHandler } from 'express';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';
import type { AutorizacionService } from '../../application/services/autorizacion.service';

const BEARER = /^Bearer (\S+)$/;

// Exige `Authorization: Bearer <accessToken>` y deja en req.usuario el usuario activo con sus permisos.
export function autenticar(autorizacionService: AutorizacionService): RequestHandler {
  return async (req, _res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      next(new ErrorDeAplicacion('NO_AUTENTICADO', 'Falta el encabezado Authorization: Bearer <token>'));
      return;
    }
    req.usuario = await autorizacionService.usuarioAutenticado(token);
    next();
  };
}
