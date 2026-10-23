import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';

const VENTANA_MS = 15 * 60 * 1000;

// Límite de solicitudes a /auth/recuperar por IP. Detrás de Nginx necesita `trust proxy` (spec de despliegue).
export function limiteRecuperacion(limitePorVentana: number): RequestHandler {
  return rateLimit({
    windowMs: VENTANA_MS,
    limit: limitePorVentana,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new ErrorDeAplicacion('DEMASIADAS_PETICIONES', 'Demasiadas solicitudes de recuperación; espera unos minutos'));
    },
  });
}
