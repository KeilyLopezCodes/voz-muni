import { type RequestHandler, Router } from 'express';
import type { LineaTiempoController } from '../controllers/linea-tiempo.controller';
import type { TicketsController } from '../controllers/tickets.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets, después de los routers con rutas fijas (/triage, /atencion, /por-asignar):
// Express 5 no acepta /:id(\d+), así que GET /:id taparía esas rutas si se montara antes.
export function ticketsRoutes(
  controller: TicketsController,
  lineaTiempo: LineaTiempoController,
  autenticar: RequestHandler,
): Router {
  const router = Router();
  router.post('/', autenticar, requierePermiso('tickets.crear'), controller.crear);
  router.get('/', autenticar, requierePermiso('tickets.ver'), controller.listar);
  // Antes de /:id, para que "resumen" no se lea como un id (SPEC 38).
  router.get('/resumen', autenticar, requierePermiso('tickets.ver'), controller.resumen);
  router.get('/:id', autenticar, requierePermiso('tickets.ver'), controller.detalle);
  router.get('/:id/linea-tiempo', autenticar, requierePermiso('tickets.ver'), lineaTiempo.listar);
  return router;
}
