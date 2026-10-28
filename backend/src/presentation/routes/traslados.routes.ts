import { type RequestHandler, Router } from 'express';
import type { TrasladosController } from '../controllers/traslados.controller';
import { ALCANCES_NO_PROPIOS } from '../../domain/auth/permisos';
import { requiereAlgunPermiso, requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1 (SPEC 21). La bandeja, la aprobación y el rechazo son solo del alcance `todas` (supervisor):
// el técnico y el coordinador (`solicitar`) reciben 403. El retiro lo valida el servicio (solo quien solicitó).
export function trasladosRoutes(controller: TrasladosController, autenticar: RequestHandler): Router {
  const router = Router();
  const puedeTrasladar = [autenticar, requierePermiso('tickets.trasladar')];
  const decide = [autenticar, requierePermiso('tickets.trasladar', ['todas'])];
  router.post('/tickets/:id/traslados', ...puedeTrasladar, controller.solicitar);
  router.get('/traslados', ...decide, controller.bandeja);
  router.post('/traslados/:id/aprobacion', ...decide, controller.aprobar);
  router.post('/traslados/:id/rechazo', ...decide, controller.rechazar);
  router.post('/traslados/:id/retiro', ...puedeTrasladar, controller.retirar);
  // Sugerir el destino de un traslado, y los filtros del listado interno (SPEC 45).
  const puedeLeerDependencias = requiereAlgunPermiso([
    { accion: 'tickets.trasladar' },
    { accion: 'tickets.ver', alcances: ALCANCES_NO_PROPIOS },
  ]);
  router.get('/dependencias', autenticar, puedeLeerDependencias, controller.dependencias);
  return router;
}
