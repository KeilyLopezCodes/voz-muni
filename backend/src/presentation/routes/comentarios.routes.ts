import { type RequestHandler, Router } from 'express';
import type { ComentariosController } from '../controllers/comentarios.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets (SPEC 23). Escribir verifica el permiso según `interno` en el controlador; editar es
// solo del autor, lo que valida el servicio.
export function comentariosRoutes(controller: ComentariosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post('/:id/comentarios', autenticar, controller.comentar);
  router.get('/:id/comentarios', autenticar, requierePermiso('tickets.ver'), controller.listar);
  router.patch('/:id/comentarios/:comentarioId', autenticar, controller.editar);
  return router;
}
