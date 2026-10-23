import type { RequestHandler } from 'express';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';
import type { Accion } from '../../domain/auth/permisos';

// Va después de `autenticar`. Solo decide si el rol puede la acción (RF-05);
// aplicar req.alcance al recurso (dependencia, propietario) es tarea del servicio.
export function requierePermiso(accion: Accion): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) {
      next(new ErrorDeAplicacion('NO_AUTENTICADO', 'requierePermiso necesita autenticar antes'));
      return;
    }
    const alcance = req.usuario.permisos[accion];
    if (!alcance) {
      next(new ErrorDeAplicacion('PERMISO_DENEGADO', `El rol ${req.usuario.rol} no tiene el permiso ${accion}`));
      return;
    }
    req.alcance = alcance;
    next();
  };
}
