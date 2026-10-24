import { type RequestHandler, Router } from 'express';
import type { TransicionesController } from '../controllers/transiciones.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets. Hoy solo las acciones del triage (SPEC 19); RF-18 sumará las suyas.
export function transicionesRoutes(controller: TransicionesController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/triage', autenticar, requierePermiso('tickets.triage'), controller.bandeja);
  router.post('/:id/transiciones', autenticar, requierePermiso('tickets.triage'), controller.transicionar);
  return router;
}
