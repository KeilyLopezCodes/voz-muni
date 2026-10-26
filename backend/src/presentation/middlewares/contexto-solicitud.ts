import type { RequestHandler } from 'express';
import type { ContextoSolicitud } from '../../domain/auditoria/contexto-solicitud';

// Cada petición corre dentro de su contexto de solicitud, con req.ip, para la bitácora (SPEC 41). Detrás de Nginx,
// req.ip necesita `trust proxy` (spec de despliegue, como el límite por IP de SPEC 08).
export function contextoSolicitud(contexto: ContextoSolicitud): RequestHandler {
  return (req, _res, next) => contexto.ejecutar(req.ip ?? null, () => next());
}
