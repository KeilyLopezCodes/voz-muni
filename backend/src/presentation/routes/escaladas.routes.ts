import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import type { EscaladasLecturaRepository } from '../../domain/repositories/escaladas-lectura-repository';
import { requierePermiso } from '../middlewares/requiere-permiso';

const consultaSchema = z
  .object({
    dependenciaId: z.coerce.number().int().positive().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamano: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// GET /api/v1/tickets/escaladas (SPEC 32). Se monta antes de ticketsRoutes, cuyo GET /:id la taparía.
export function escaladasRoutes(escaladas: EscaladasLecturaRepository, autenticar: RequestHandler): Router {
  const router = Router();
  router.get('/escaladas', autenticar, requierePermiso('tickets.triage'), async (req: Request, res: Response) => {
    const { dependenciaId, pagina, tamano } = consultaSchema.parse(req.query);
    res.status(200).json(await escaladas.listar(dependenciaId ?? null, pagina, tamano));
  });
  return router;
}
