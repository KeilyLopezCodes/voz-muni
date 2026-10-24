import { type RequestHandler, Router } from 'express';
import type { TrasladosController } from '../controllers/traslados.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1 (SPEC 21). La bandeja, la aprobación y el rechazo son solo del alcance `todas` (supervisor):
// el técnico y el coordinador (`solicitar`) reciben 403. El retiro lo valida el servicio (solo quien solicitó).
export function trasladosRoutes(controller: TrasladosController, autenticar: RequestHandler): Router {
  const router = Router();
  const puedeTrasladar = [autenticar, requierePermiso('tickets.trasladar')];
  const decide = [autenticar, requierePermiso('tickets.trasladar', ['todas'])];
  router.post('/tickets/:id/traslados', ...puedeTrasladar, controller.solicitar);
  router.get('/traslados', ...decide, controller.bandeja);
  router.post('/traslados/:id/aprobacion', ...decide, controller.aprobar);
  router.post('/traslados/:id/rechazo', ...decide, controller.rechazar);
  router.post('/traslados/:id/retiro', ...puedeTrasladar, controller.retirar);
  router.get('/dependencias', ...puedeTrasladar, controller.dependencias);
  return router;
}
