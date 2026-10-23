import { type RequestHandler, Router } from 'express';
import type { RecuperacionController } from '../controllers/recuperacion.controller';

// Se monta en /api/v1/auth, junto a las rutas de sesión.
export function recuperacionRoutes(controller: RecuperacionController, limiteRecuperacion: RequestHandler): Router {
  const router = Router();
  router.post('/recuperar', limiteRecuperacion, controller.recuperar);
  router.post('/restablecer', controller.restablecer);
  return router;
}
