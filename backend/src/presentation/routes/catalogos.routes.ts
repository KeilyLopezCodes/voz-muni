import { type RequestHandler, Router } from 'express';
import type { CatalogosController } from '../controllers/catalogos.controller';
import { ALCANCES_NO_PROPIOS } from '../../domain/auth/permisos';
import { requiereAlgunPermiso, requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1. Catálogos del formulario de queja: con sesión y tickets.crear (vecino, receptor, supervisor).
// Las categorías también llenan los filtros del listado interno: tickets.ver con un alcance que no es `propia` (SPEC 45).
// Los middlewares van por ruta, no con router.use, para no interceptar otras rutas de /api/v1.
export function catalogosRoutes(controller: CatalogosController, autenticar: RequestHandler): Router {
  const router = Router();
  const puedeRegistrar = requierePermiso('tickets.crear');
  const puedeLeerCategorias = requiereAlgunPermiso([
    { accion: 'tickets.crear' },
    { accion: 'tickets.ver', alcances: ALCANCES_NO_PROPIOS },
  ]);
  router.get('/categorias', autenticar, puedeLeerCategorias, controller.categorias);
  router.get('/zonas', autenticar, puedeRegistrar, controller.zonas);
  return router;
}
