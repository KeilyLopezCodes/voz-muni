import { type RequestHandler, Router } from 'express';
import type { ParametrosController } from '../controllers/parametros.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1. Los middlewares van por ruta, no con router.use, para no interceptar otras rutas de /api/v1.
export function parametrosRoutes(controller: ParametrosController, autenticar: RequestHandler): Router {
  const router = Router();
  // El formulario la usa para centrar el mapa, u ocultarlo si no hay configuración.
  router.get('/parametros/limites-municipio', autenticar, requierePermiso('tickets.crear'), controller.obtenerLimites);
  router.put(
    '/admin/parametros/limites-municipio',
    autenticar,
    requierePermiso('admin.catalogos'),
    controller.guardarLimites,
  );
  return router;
}
