import { type RequestHandler, Router } from 'express';
import type { UsuariosController } from '../controllers/usuarios.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/admin/usuarios. Todas las rutas exigen sesión y el permiso admin.usuarios (RF-05).
export function usuariosRoutes(controller: UsuariosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.use(autenticar, requierePermiso('admin.usuarios'));
  router.get('/', controller.listar);
  router.post('/', controller.crear);
  router.get('/:id', controller.obtener);
  router.patch('/:id', controller.actualizar);
  router.post('/:id/desactivacion', controller.desactivar);
  router.post('/:id/activacion', controller.activar);
  router.post('/:id/desbloqueo', controller.desbloquear);
  return router;
}
