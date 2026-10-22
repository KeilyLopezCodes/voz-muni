import { HealthService } from '../../src/application/services/health.service';
import type { Clock } from '../../src/domain/health/clock';
import type { DatabaseHealthCheck } from '../../src/domain/health/database-health-check';

describe('HealthService', () => {
  const fixedClock: Clock = { now: () => new Date('2026-10-22T15:04:05.000Z') };

  it('devuelve ok/up con la base arriba y el timestamp del reloj en ISO UTC', async () => {
    const databaseUp: DatabaseHealthCheck = { isUp: async () => true };
    const service = new HealthService(fixedClock, databaseUp);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
      timestamp: '2026-10-22T15:04:05.000Z',
    });
  });

  it('devuelve degraded/down con la base caída', async () => {
    const databaseDown: DatabaseHealthCheck = { isUp: async () => false };
    const service = new HealthService(fixedClock, databaseDown);

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      database: 'down',
      timestamp: '2026-10-22T15:04:05.000Z',
    });
  });
});
