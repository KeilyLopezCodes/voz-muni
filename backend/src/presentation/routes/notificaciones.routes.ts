import { type RequestHandler, Router } from 'express';
import type { NotificacionesController } from '../controllers/notificaciones.controller';

// Se monta en /api/v1/notificaciones (SPEC 31). Solo autenticar: no hay una acción de la matriz, porque cada
// usuario solo ve y marca las suyas.
export function notificacionesRoutes(controller: NotificacionesController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/', autenticar, controller.listar);
  router.post('/marcar-leidas', autenticar, controller.marcarTodas);
  router.patch('/:id', autenticar, controller.marcar);
  return router;
}
