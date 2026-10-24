import { type RequestHandler, Router } from 'express';
import type { NotificacionesController } from '../controllers/notificaciones.controller';

// Se monta en /api/v1/notificaciones. Solo autenticar: cada usuario ve únicamente las suyas (SPEC 31).
export function notificacionesRoutes(controller: NotificacionesController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/', autenticar, controller.listar);
  router.post('/marcar-leidas', autenticar, controller.marcarTodas);
  router.patch('/:id', autenticar, controller.marcar);
  return router;
}
