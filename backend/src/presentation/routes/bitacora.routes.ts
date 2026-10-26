import { type RequestHandler, Router } from 'express';
import type { BitacoraController } from '../controllers/bitacora.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/bitacora (SPEC 41). El alcance de bitacora.ver decide qué registros se ven (SPEC 11).
export function bitacoraRoutes(controller: BitacoraController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/', autenticar, requierePermiso('bitacora.ver'), controller.consultar);
  router.get('/acciones', autenticar, requierePermiso('bitacora.ver'), controller.acciones);
  return router;
}
