import { type RequestHandler, Router } from 'express';
import type { CatalogosAdminController } from '../controllers/catalogos-admin.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/admin (SPEC 40), junto a las políticas de SLA (SPEC 29) y los campos adicionales (SPEC 14).
// No hay DELETE: los catálogos se desactivan, porque las quejas históricas los referencian.
export function catalogosAdminRoutes(controller: CatalogosAdminController, autenticar: RequestHandler): Router {
  const router = Router();
  const admin = [autenticar, requierePermiso('admin.catalogos')];
  router.get('/dependencias', ...admin, controller.listarDependencias);
  router.post('/dependencias', ...admin, controller.crearDependencia);
  router.patch('/dependencias/:id', ...admin, controller.editarDependencia);
  router.get('/categorias', ...admin, controller.listarCategorias);
  router.post('/categorias', ...admin, controller.crearCategoria);
  router.patch('/categorias/:id', ...admin, controller.editarCategoria);
  router.get('/zonas', ...admin, controller.listarZonas);
  router.post('/zonas', ...admin, controller.crearZona);
  router.patch('/zonas/:id', ...admin, controller.editarZona);
  return router;
}
