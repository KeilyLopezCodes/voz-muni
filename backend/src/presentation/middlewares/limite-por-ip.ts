import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErrorDeAplicacion } from '../../application/errors/error-de-aplicacion';

const VENTANA_MS = 15 * 60 * 1000;

// RNF-10: hasta `limitePorVentana` peticiones por IP cada 15 minutos; la siguiente responde 429 DEMASIADAS_PETICIONES
// con `mensaje`. Cada llamada crea su propio contador. Detrás de Nginx necesita `trust proxy` (spec de despliegue).
export function limitePorIp(limitePorVentana: number, mensaje: string): RequestHandler {
  return rateLimit({
    windowMs: VENTANA_MS,
    limit: limitePorVentana,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new ErrorDeAplicacion('DEMASIADAS_PETICIONES', mensaje));
    },
  });
}
