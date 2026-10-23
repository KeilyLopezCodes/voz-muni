import { Router } from 'express';
import type { RegistroController } from '../controllers/registro.controller';

// Se monta en /api/v1/auth. Ambas rutas son públicas.
export function registroRoutes(controller: RegistroController): Router {
  const router = Router();
  router.post('/registro', controller.registrar);
  router.post('/verificar', controller.verificar);
  return router;
}
