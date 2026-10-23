import { type RequestHandler, Router } from 'express';
import type { CatalogosController } from '../controllers/catalogos.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1. Catálogos del formulario de queja: con sesión y tickets.crear (vecino, receptor, supervisor).
// Los middlewares van por ruta, no con router.use, para no interceptar otras rutas de /api/v1.
export function catalogosRoutes(controller: CatalogosController, autenticar: RequestHandler): Router {
  const router = Router();
  const puedeRegistrar = requierePermiso('tickets.crear');
  router.get('/categorias', autenticar, puedeRegistrar, controller.categorias);
  router.get('/zonas', autenticar, puedeRegistrar, controller.zonas);
  return router;
}
