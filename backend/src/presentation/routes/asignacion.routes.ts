import { type RequestHandler, Router } from 'express';
import type { AsignacionController } from '../controllers/asignacion.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1 (SPEC 20).
export function asignacionRoutes(controller: AsignacionController, autenticar: RequestHandler): Router {
  const router = Router();
  const puedeAsignar = [autenticar, requierePermiso('tickets.asignar')];
  router.get('/tickets/por-asignar', ...puedeAsignar, controller.porAsignar);
  router.patch('/tickets/:id/asignacion', ...puedeAsignar, controller.asignar);
  router.get('/dependencias/:id/tecnicos', ...puedeAsignar, controller.tecnicos);
  return router;
}
