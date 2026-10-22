import { HealthService } from '../../src/application/services/health.service';
import type { Clock } from '../../src/domain/health/clock';

describe('HealthService', () => {
  it('devuelve status ok con el timestamp del reloj en ISO UTC', () => {
    const fixedClock: Clock = { now: () => new Date('2026-10-22T15:04:05.000Z') };
    const service = new HealthService(fixedClock);

    expect(service.check()).toEqual({
      status: 'ok',
      timestamp: '2026-10-22T15:04:05.000Z',
    });
  });
});
