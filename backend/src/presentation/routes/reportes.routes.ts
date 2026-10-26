import { type RequestHandler, Router } from 'express';
import type { ReportesController } from '../controllers/reportes.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/reportes (SPEC 43). El alcance de reportes.ver decide qué quejas cuentan (SPEC 11).
export function reportesRoutes(controller: ReportesController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/resumen', autenticar, requierePermiso('reportes.ver'), controller.resumen);
  return router;
}
