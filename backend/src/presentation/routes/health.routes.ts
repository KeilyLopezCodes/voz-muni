import { Router } from 'express';
import type { HealthController } from '../controllers/health.controller';

export function healthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get('/health', controller.check);
  return router;
}
