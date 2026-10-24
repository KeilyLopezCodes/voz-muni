import express, { type Express } from 'express';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import { HealthService } from '../../../src/application/services/health.service';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
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
    prepararAlmacen: async () => {},
    dispose: async () => {},
  } as unknown as Container;
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

  it('traduce InvalidTransitionError del dominio a 409 TRANSICION_INVALIDA (SPEC 19)', async () => {
    const res = await request(appQueLanza(new InvalidTransitionError('nueva', 'asignada'))).get('/falla');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ codigo: 'TRANSICION_INVALIDA', mensaje: 'No se permite pasar de nueva a asignada' });
  });

  it('traduce ReglaDeNegocioError del dominio a 400 con su codigo (SPEC 19)', async () => {
    const res = await request(appQueLanza(new ReglaDeNegocioError('MOTIVO_REQUERIDO', 'El motivo es obligatorio'))).get(
      '/falla',
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'MOTIVO_REQUERIDO', mensaje: 'El motivo es obligatorio' });
  });

  it('una ReglaDeNegocioError con detalles los incluye', async () => {
    const detalles = [{ campo: 'x', problema: 'REQUERIDO' }];
    const res = await request(appQueLanza(new ReglaDeNegocioError('DATOS_EXTRA_INVALIDOS', 'Datos', detalles))).get(
      '/falla',
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'DATOS_EXTRA_INVALIDOS', mensaje: 'Datos', detalles });
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
