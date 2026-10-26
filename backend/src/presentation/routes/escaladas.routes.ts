import { type RequestHandler, Router } from 'express';
import type { EscaladasController } from '../controllers/escaladas.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets, antes de ticketsRoutes: su GET /:id taparía /escaladas (SPEC 25).
export function escaladasRoutes(controller: EscaladasController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/escaladas', autenticar, requierePermiso('tickets.triage'), controller.listar);
  return router;
}
