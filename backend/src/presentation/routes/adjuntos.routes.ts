import { type RequestHandler, Router } from 'express';
import type { AdjuntosController } from '../controllers/adjuntos.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';
import { subidaAdjuntos } from '../middlewares/subida-adjuntos';

// Se monta en /api/v1/tickets (SPEC 24). La carpeta de los archivos nunca se sirve como estática: todo pasa por
// estos endpoints, que verifican el alcance y la visibilidad. Subir y borrar deciden los permisos en el servicio
// (origen, permiso de comentar, autor).
export function adjuntosRoutes(controller: AdjuntosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post('/:id/adjuntos', autenticar, subidaAdjuntos, controller.subir);
  router.get('/:id/adjuntos', autenticar, requierePermiso('tickets.ver'), controller.listar);
  router.get('/:id/adjuntos/:adjuntoId/contenido', autenticar, requierePermiso('tickets.ver'), controller.descargar);
  router.delete('/:id/adjuntos/:adjuntoId', autenticar, controller.borrar);
  return router;
}
