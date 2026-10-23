import express, { type Express } from 'express';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import type { AuthService } from '../../../src/application/services/auth.service';
import type { AutorizacionService } from '../../../src/application/services/autorizacion.service';
import type { RecuperacionService } from '../../../src/application/services/recuperacion.service';
import type { UsuariosService } from '../../../src/application/services/usuarios.service';
import type { RegistroTicketsService } from '../../../src/application/services/registro-tickets.service';
import type { VecinosService } from '../../../src/application/services/vecinos.service';
import type { CatalogosService } from '../../../src/application/services/catalogos.service';
import type { CamposExtraService } from '../../../src/application/services/campos-extra.service';
import type { ConsultaTicketsService } from '../../../src/application/services/consulta-tickets.service';
import type { BitacoraLecturaRepository } from '../../../src/domain/repositories/bitacora-lectura-repository';
import type { ReporteLecturaRepository } from '../../../src/domain/repositories/reporte-lectura-repository';
import { HealthService } from '../../../src/application/services/health.service';
import type { Container } from '../../../src/container';
import { manejadorErrores } from '../../../src/presentation/middlewares/manejador-errores';

// Container armado a mano: las pruebas no tocan Postgres.
function buildTestContainer(): Container {
  return {
    port: 0,
    loginLimitePorVentana: 10,
    recuperacionLimitePorVentana: 5,
    healthService: new HealthService({ now: () => new Date() }, { isUp: async () => true }),
    // Estas pruebas fallan antes de llegar a los servicios de auth.
    authService: {} as AuthService,
    autorizacionService: {} as AutorizacionService,
    recuperacionService: {} as RecuperacionService,
    usuariosService: {} as UsuariosService,
    consultaTicketsService: {} as ConsultaTicketsService,
    reportesLectura: {} as ReporteLecturaRepository,
    bitacoraLectura: {} as BitacoraLecturaRepository,
    registroTicketsService: {} as RegistroTicketsService,
    vecinosService: {} as VecinosService,
    catalogosService: {} as CatalogosService,
    camposExtraService: {} as CamposExtraService,
    dispose: async () => {},
  };
}

// App mínima con rutas que lanzan errores, para probar solo el manejador.
function appQueLanza(error: unknown): Express {
  const app = express();
  app.get('/falla', () => {
    throw error;
  });
  app.use(manejadorErrores);
  return app;
}

describe('manejadorErrores', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responde 404 NO_ENCONTRADO a una ruta desconocida de /api/v1', async () => {
    const res = await request(createApp(buildTestContainer())).get('/api/v1/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: expect.any(String) });
  });

  it('responde 400 VALIDACION a un JSON mal formado', async () => {
    const res = await request(createApp(buildTestContainer()))
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String) });
  });

  it('traduce ErrorDeAplicacion por su codigo', async () => {
    const res = await request(appQueLanza(new ErrorDeAplicacion('PERMISO_DENEGADO', 'Sin permiso'))).get('/falla');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'PERMISO_DENEGADO', mensaje: 'Sin permiso' });
  });

  it('responde 500 ERROR_INTERNO sin la traza a un error inesperado', async () => {
    const res = await request(appQueLanza(new Error('fallo de la base en la línea 42'))).get('/falla');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno' });
    expect(JSON.stringify(res.body)).not.toContain('stack');
    expect(JSON.stringify(res.body)).not.toContain('línea 42');
  });

  it('/health no cambia', async () => {
    const res = await request(createApp(buildTestContainer())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', timestamp: expect.any(String) });
  });
});
