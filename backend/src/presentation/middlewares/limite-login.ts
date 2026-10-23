import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';

const VENTANA_MS = 15 * 60 * 1000;

// RNF-10: límite de peticiones a /auth/login por IP. Detrás de Nginx necesita `trust proxy` (spec de despliegue).
export function limiteLogin(limitePorVentana: number): RequestHandler {
  return rateLimit({
    windowMs: VENTANA_MS,
    limit: limitePorVentana,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new ErrorDeAplicacion('DEMASIADAS_PETICIONES', 'Demasiados intentos de inicio de sesión; espera unos minutos'));
    },
  });
}
