import { type RequestHandler, Router } from 'express';
import type { ConsultaPublicaController } from '../controllers/consulta-publica.controller';

// Rutas públicas (RF-35, SPEC 37), sin autenticar. La query lleva el contacto del solicitante: ningún log del
// backend la escribe (manejador-errores.ts).
export function consultaPublicaRoutes(controller: ConsultaPublicaController, limite: RequestHandler): Router {
  const router = Router();
  // Ni el navegador ni un proxy deben guardar la respuesta, tampoco la de un error.
  const sinCache: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  router.get('/tickets/:numero', sinCache, limite, controller.consultar);
  return router;
}
