import express, { type Express } from 'express';
import type { Container } from './container';
import { AuthController } from './presentation/controllers/auth.controller';
import { HealthController } from './presentation/controllers/health.controller';
import { RecuperacionController } from './presentation/controllers/recuperacion.controller';
import { autenticar } from './presentation/middlewares/autenticar';
import { limiteLogin } from './presentation/middlewares/limite-login';
import { limiteRecuperacion } from './presentation/middlewares/limite-recuperacion';
import { manejadorErrores, rutaNoEncontrada } from './presentation/middlewares/manejador-errores';
import { authRoutes } from './presentation/routes/auth.routes';
import { healthRoutes } from './presentation/routes/health.routes';
import { recuperacionRoutes } from './presentation/routes/recuperacion.routes';

export function createApp(container: Container): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRoutes(new HealthController(container.healthService)));
  app.use(
    '/api/v1/auth',
    authRoutes(
      new AuthController(container.authService),
      limiteLogin(container.loginLimitePorVentana),
      autenticar(container.autorizacionService),
    ),
  );
  app.use(
    '/api/v1/auth',
    recuperacionRoutes(
      new RecuperacionController(container.recuperacionService),
      limiteRecuperacion(container.recuperacionLimitePorVentana),
    ),
  );
  app.use('/api/v1', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
