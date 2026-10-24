import express, { type Express } from 'express';
import type { Container } from './container';
import { AsignacionController } from './presentation/controllers/asignacion.controller';
import { AuthController } from './presentation/controllers/auth.controller';
import { CamposExtraController } from './presentation/controllers/campos-extra.controller';
import { CatalogosController } from './presentation/controllers/catalogos.controller';
import { ParametrosController } from './presentation/controllers/parametros.controller';
import { HealthController } from './presentation/controllers/health.controller';
import { RecuperacionController } from './presentation/controllers/recuperacion.controller';
import { RegistroController } from './presentation/controllers/registro.controller';
import { TicketsController } from './presentation/controllers/tickets.controller';
import { TransicionesController } from './presentation/controllers/transiciones.controller';
import { UsuariosController } from './presentation/controllers/usuarios.controller';
import { VecinosController } from './presentation/controllers/vecinos.controller';
import { autenticar } from './presentation/middlewares/autenticar';
import { limiteLogin } from './presentation/middlewares/limite-login';
import { limiteRecuperacion } from './presentation/middlewares/limite-recuperacion';
import { manejadorErrores, rutaNoEncontrada } from './presentation/middlewares/manejador-errores';
import { asignacionRoutes } from './presentation/routes/asignacion.routes';
import { authRoutes } from './presentation/routes/auth.routes';
import { camposExtraRoutes } from './presentation/routes/campos-extra.routes';
import { catalogosRoutes } from './presentation/routes/catalogos.routes';
import { parametrosRoutes } from './presentation/routes/parametros.routes';
import { healthRoutes } from './presentation/routes/health.routes';
import { recuperacionRoutes } from './presentation/routes/recuperacion.routes';
import { registroRoutes } from './presentation/routes/registro.routes';
import { ticketsRoutes } from './presentation/routes/tickets.routes';
import { transicionesRoutes } from './presentation/routes/transiciones.routes';
import { usuariosRoutes } from './presentation/routes/usuarios.routes';
import { vecinosRoutes } from './presentation/routes/vecinos.routes';

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
  app.use('/api/v1/auth', registroRoutes(new RegistroController(container.registroVecinosService)));
  app.use(
    '/api/v1/admin/usuarios',
    usuariosRoutes(new UsuariosController(container.usuariosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    ticketsRoutes(new TicketsController(container.registroTicketsService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    transicionesRoutes(new TransicionesController(container.triageService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    asignacionRoutes(new AsignacionController(container.asignacionService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/vecinos',
    vecinosRoutes(new VecinosController(container.vecinosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    catalogosRoutes(new CatalogosController(container.catalogosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/admin/categorias',
    camposExtraRoutes(new CamposExtraController(container.camposExtraService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    parametrosRoutes(new ParametrosController(container.parametrosService), autenticar(container.autorizacionService)),
  );
  app.use('/api/v1', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
