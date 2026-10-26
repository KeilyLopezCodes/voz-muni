import { type RequestHandler, Router } from 'express';
import type { PoliticasSlaController } from '../controllers/politicas-sla.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/admin (SPEC 29). No hay DELETE: una matriz solo se reemplaza completa.
export function politicasSlaRoutes(controller: PoliticasSlaController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/politicas-sla', autenticar, requierePermiso('admin.catalogos'), controller.listar);
  router.put('/categorias/:id/politicas-sla', autenticar, requierePermiso('admin.catalogos'), controller.reemplazar);
  return router;
}
