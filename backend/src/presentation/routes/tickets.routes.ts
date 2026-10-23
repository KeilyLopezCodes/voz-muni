import { type RequestHandler, Router } from 'express';
import type { TicketsController } from '../controllers/tickets.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets.
export function ticketsRoutes(controller: TicketsController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post('/', autenticar, requierePermiso('tickets.crear'), controller.crear);
  return router;
}
