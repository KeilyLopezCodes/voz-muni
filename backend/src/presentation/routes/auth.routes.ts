import { type RequestHandler, Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';

// Se monta en /api/v1/auth.
export function authRoutes(controller: AuthController, limiteLogin: RequestHandler, autenticar: RequestHandler): Router {
  const router = Router();
  router.post('/login', limiteLogin, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/sesion', autenticar, controller.sesion);
  return router;
}
