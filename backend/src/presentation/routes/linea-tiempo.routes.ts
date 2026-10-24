import { type RequestHandler, Router } from 'express';
import type { LineaTiempoController } from '../controllers/linea-tiempo.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets (SPEC 28).
export function lineaTiempoRoutes(controller: LineaTiempoController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/:id/linea-tiempo', autenticar, requierePermiso('tickets.ver'), controller.listar);
  return router;
}
