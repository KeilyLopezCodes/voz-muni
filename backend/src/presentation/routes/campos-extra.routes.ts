import { type RequestHandler, Router } from 'express';
import type { CamposExtraController } from '../controllers/campos-extra.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/admin/categorias. El resto del CRUD de categorías llega con RF-41.
export function camposExtraRoutes(controller: CamposExtraController, autenticar: RequestHandler): Router {
  const router = Router();
  router.put('/:id/campos-extra', autenticar, requierePermiso('admin.catalogos'), controller.actualizar);
  return router;
}
