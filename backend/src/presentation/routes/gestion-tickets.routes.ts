import { type RequestHandler, Router } from 'express';
import type { Alcance } from '../../domain/auth/permisos';
import type { GestionTicketsController } from '../controllers/gestion-tickets.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Los alcances internos de tickets.ver: el vecino (propia) tiene "Mis quejas" (SPEC 25).
const ALCANCES_INTERNOS: readonly Alcance[] = ['registradas', 'asignadas', 'dependencia', 'todas'];

// Se monta en /api/v1/tickets, antes de ticketsRoutes: su GET /:id taparía /gestion (SPEC 25).
export function gestionTicketsRoutes(controller: GestionTicketsController, autenticar: RequestHandler): Router {
  const router = Router();
  const permiso = requierePermiso('tickets.ver', ALCANCES_INTERNOS);
  router.get('/gestion', autenticar, permiso, controller.listar);
  router.get('/gestion/opciones', autenticar, permiso, controller.opciones);
  return router;
}
