import { type RequestHandler, Router } from 'express';
import type { VecinosController } from '../controllers/vecinos.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/vecinos. Solo para quien registra a nombre de un vecino: el vecino (`propia`) recibe 403.
// Buscar (SPEC 12) y dar de alta (SPEC 13) usan el mismo criterio.
export function vecinosRoutes(controller: VecinosController, autenticar: RequestHandler): Router {
  const router = Router();
  const soloQuienRegistraPorOtros = requierePermiso('tickets.crear', ['a_nombre_de_vecino', 'todas']);
  router.get('/', autenticar, soloQuienRegistraPorOtros, controller.buscar);
  router.post('/', autenticar, soloQuienRegistraPorOtros, controller.crear);
  return router;
}
