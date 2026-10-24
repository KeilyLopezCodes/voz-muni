import { type RequestHandler, Router } from 'express';
import { ALCANCES_ATENCION } from '../../domain/atencion/acciones-atencion';
import type { TransicionesController } from '../controllers/transiciones.controller';
import { requierePermiso } from '../middlewares/requiere-permiso';

// Se monta en /api/v1/tickets. /transiciones no lleva requierePermiso fijo: el controlador elige el permiso según
// la acción (triage de SPEC 19, atención de SPEC 22).
export function transicionesRoutes(controller: TransicionesController, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/triage', autenticar, requierePermiso('tickets.triage'), controller.bandeja);
  router.get(
    '/atencion',
    autenticar,
    requierePermiso('tickets.cambiar_estado', ALCANCES_ATENCION),
    controller.bandejaAtencion,
  );
  router.post('/:id/transiciones', autenticar, controller.transicionar);
  return router;
}
