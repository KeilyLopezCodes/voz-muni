import { type RequestHandler, Router } from 'express';
import type { VecinosController } from '../controllers/vecinos.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/vecinos. Solo para quien registra a nombre de un vecino: el vecino (`propia`) recibe 403.
export function vecinosRoutes(controller: VecinosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/', autenticar, requierePermiso('tickets.crear', ['a_nombre_de_vecino', 'todas']), controller.buscar);
  return router;
}
