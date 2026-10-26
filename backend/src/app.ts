import express, { type Express } from 'express';
import type { Container } from './container';
import { AdjuntosController } from './presentation/controllers/adjuntos.controller';
import { AsignacionController } from './presentation/controllers/asignacion.controller';
import { AuthController } from './presentation/controllers/auth.controller';
import { CatalogosAdminController } from './presentation/controllers/catalogos-admin.controller';
import { CamposExtraController } from './presentation/controllers/campos-extra.controller';
import { CatalogosController } from './presentation/controllers/catalogos.controller';
import { ConsultaPublicaController } from './presentation/controllers/consulta-publica.controller';
import { ComentariosController } from './presentation/controllers/comentarios.controller';
import { EncuestasController } from './presentation/controllers/encuestas.controller';
import { EscaladasController } from './presentation/controllers/escaladas.controller';
import { NotificacionesController } from './presentation/controllers/notificaciones.controller';
import { ParametrosController } from './presentation/controllers/parametros.controller';
import { PoliticasSlaController } from './presentation/controllers/politicas-sla.controller';
import { HealthController } from './presentation/controllers/health.controller';
import { LineaTiempoController } from './presentation/controllers/linea-tiempo.controller';
import { RecuperacionController } from './presentation/controllers/recuperacion.controller';
import { RegistroController } from './presentation/controllers/registro.controller';
import { TicketsController } from './presentation/controllers/tickets.controller';
import { TransicionesController } from './presentation/controllers/transiciones.controller';
import { TrasladosController } from './presentation/controllers/traslados.controller';
import { UsuariosController } from './presentation/controllers/usuarios.controller';
import { VecinosController } from './presentation/controllers/vecinos.controller';
import { autenticar } from './presentation/middlewares/autenticar';
import { limiteLogin } from './presentation/middlewares/limite-login';
import { limitePorIp } from './presentation/middlewares/limite-por-ip';
import { limiteRecuperacion } from './presentation/middlewares/limite-recuperacion';
import { manejadorErrores, rutaNoEncontrada } from './presentation/middlewares/manejador-errores';
import { adjuntosRoutes } from './presentation/routes/adjuntos.routes';
import { asignacionRoutes } from './presentation/routes/asignacion.routes';
import { authRoutes } from './presentation/routes/auth.routes';
import { catalogosAdminRoutes } from './presentation/routes/catalogos-admin.routes';
import { camposExtraRoutes } from './presentation/routes/campos-extra.routes';
import { catalogosRoutes } from './presentation/routes/catalogos.routes';
import { comentariosRoutes } from './presentation/routes/comentarios.routes';
import { encuestasRoutes } from './presentation/routes/encuestas.routes';
import { escaladasRoutes } from './presentation/routes/escaladas.routes';
import { notificacionesRoutes } from './presentation/routes/notificaciones.routes';
import { parametrosRoutes } from './presentation/routes/parametros.routes';
import { politicasSlaRoutes } from './presentation/routes/politicas-sla.routes';
import { healthRoutes } from './presentation/routes/health.routes';
import { recuperacionRoutes } from './presentation/routes/recuperacion.routes';
import { registroRoutes } from './presentation/routes/registro.routes';
import { ticketsRoutes } from './presentation/routes/tickets.routes';
import { consultaPublicaRoutes } from './presentation/routes/consulta-publica.routes';
import { transicionesRoutes } from './presentation/routes/transiciones.routes';
import { trasladosRoutes } from './presentation/routes/traslados.routes';
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
  // Consulta pública sin sesión (SPEC 37), con su propio límite por IP.
  app.use(
    '/api/v1/public',
    consultaPublicaRoutes(
      new ConsultaPublicaController(container.consultaPublicaService),
      limitePorIp(container.consultaLimitePorVentana, 'Hiciste demasiadas consultas; espera unos minutos'),
    ),
  );
  app.use(
    '/api/v1/admin/usuarios',
    usuariosRoutes(new UsuariosController(container.usuariosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    transicionesRoutes(new TransicionesController(container.triageService, container.atencionService, container.confirmacionService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    asignacionRoutes(new AsignacionController(container.asignacionService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    trasladosRoutes(new TrasladosController(container.trasladosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    comentariosRoutes(new ComentariosController(container.comentariosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    adjuntosRoutes(new AdjuntosController(container.adjuntosService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    encuestasRoutes(new EncuestasController(container.encuestasService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/tickets',
    escaladasRoutes(new EscaladasController(container.escaladasService), autenticar(container.autorizacionService)),
  );
  // Después de los routers con rutas fijas bajo /api/v1/tickets: su GET /:id las taparía (SPEC 25).
  app.use(
    '/api/v1/tickets',
    ticketsRoutes(
      new TicketsController(container.registroTicketsService, container.consultaTicketsService),
      new LineaTiempoController(container.lineaTiempoService),
      autenticar(container.autorizacionService),
    ),
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
    '/api/v1/notificaciones',
    notificacionesRoutes(
      new NotificacionesController(container.notificacionesService),
      autenticar(container.autorizacionService),
    ),
  );
  app.use(
    '/api/v1/admin',
    catalogosAdminRoutes(new CatalogosAdminController(container.catalogosAdminService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1/admin',
    politicasSlaRoutes(new PoliticasSlaController(container.politicasSlaService), autenticar(container.autorizacionService)),
  );
  app.use(
    '/api/v1',
    parametrosRoutes(new ParametrosController(container.parametrosService), autenticar(container.autorizacionService)),
  );
  app.use('/api/v1', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
