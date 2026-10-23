import request from 'supertest';
import { createApp } from '../../src/app';
import type { AuthService } from '../../src/application/services/auth.service';
import type { AutorizacionService } from '../../src/application/services/autorizacion.service';
import type { RecuperacionService } from '../../src/application/services/recuperacion.service';
import type { UsuariosService } from '../../src/application/services/usuarios.service';
import { HealthService } from '../../src/application/services/health.service';
import type { Container } from '../../src/container';
import type { Clock } from '../../src/domain/health/clock';
import type { DatabaseHealthCheck } from '../../src/domain/health/database-health-check';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Container armado a mano: las pruebas no tocan Postgres.
function buildTestContainer(databaseUp: boolean): Container {
  const clock: Clock = { now: () => new Date() };
  const databaseHealthCheck: DatabaseHealthCheck = { isUp: async () => databaseUp };
  return {
    port: 0,
    loginLimitePorVentana: 10,
    recuperacionLimitePorVentana: 5,
    healthService: new HealthService(clock, databaseHealthCheck),
    // /health no los usa.
    authService: {} as AuthService,
    autorizacionService: {} as AutorizacionService,
    recuperacionService: {} as RecuperacionService,
    usuariosService: {} as UsuariosService,
    dispose: async () => {},
  };
}

describe('GET /health', () => {
  it('responde 200 con status ok y database up cuando la base está arriba', async () => {
    const res = await request(createApp(buildTestContainer(true))).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', timestamp: expect.stringMatching(ISO_UTC) });
  });

  it('responde 503 con status degraded y database down cuando la base está caída', async () => {
    const res = await request(createApp(buildTestContainer(false))).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down', timestamp: expect.stringMatching(ISO_UTC) });
  });
});
