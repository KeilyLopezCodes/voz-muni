import express, { type Express } from 'express';
import type { Container } from './container';
import { HealthController } from './presentation/controllers/health.controller';
import { healthRoutes } from './presentation/routes/health.routes';

export function createApp(container: Container): Express {
  const app = express();
  app.use(healthRoutes(new HealthController(container.healthService)));
  return app;
}
