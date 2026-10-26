import { type RequestHandler, Router } from 'express';
import type { EncuestasController } from '../controllers/encuestas.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets (SPEC 39). Quién puede calificar (el solicitante) lo decide el servicio.
export function encuestasRoutes(controller: EncuestasController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post('/:id/encuesta', autenticar, requierePermiso('tickets.ver'), controller.calificar);
  return router;
}
