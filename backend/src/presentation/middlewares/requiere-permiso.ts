import type { Request, RequestHandler } from 'express';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';
import type { Accion, Alcance } from '../../domain/auth/permisos';

// Va después de `autenticar`. Solo decide si el rol puede la acción (RF-05);
// aplicar req.alcance al recurso (dependencia, propietario) es tarea del servicio.
// `alcances` limita además los alcances admitidos (p. ej. /vecinos no es para el alcance `propia`).
export function requierePermiso(accion: Accion, alcances?: readonly Alcance[]): RequestHandler {
  return (req, _res, next) => {
    try {
      verificarPermiso(req, accion, alcances);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Basta con cumplir uno de los permisos (SPEC 45): deja en req.alcance el alcance del primero que se cumple, o
// responde PERMISO_DENEGADO si no se cumple ninguno.
export function requiereAlgunPermiso(permisos: readonly { accion: Accion; alcances?: readonly Alcance[] }[]): RequestHandler {
  return (req, _res, next) => {
    let ultimoError: unknown = new ErrorDeAplicacion('PERMISO_DENEGADO', 'Sin permisos que verificar');
    for (const { accion, alcances } of permisos) {
      try {
        verificarPermiso(req, accion, alcances);
        next();
        return;
      } catch (error) {
        ultimoError = error;
      }
    }
    next(ultimoError);
  };
}

// La misma regla para cuando el permiso depende del cuerpo (/transiciones, SPEC 22): deja req.alcance o lanza.
export function verificarPermiso(req: Request, accion: Accion, alcances?: readonly Alcance[]): Alcance {
  if (!req.usuario) {
    throw new ErrorDeAplicacion('NO_AUTENTICADO', 'requierePermiso necesita autenticar antes');
  }
  const alcance = req.usuario.permisos[accion];
  if (!alcance || (alcances && !alcances.includes(alcance))) {
    throw new ErrorDeAplicacion('PERMISO_DENEGADO', `El rol ${req.usuario.rol} no tiene el permiso ${accion}`);
  }
  req.alcance = alcance;
  return alcance;
}
