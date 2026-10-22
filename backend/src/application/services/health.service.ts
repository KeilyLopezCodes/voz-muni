import type { Clock } from '../../domain/health/clock';
import type { HealthStatus } from '../../domain/health/health-status';
import type { HealthDto } from '../dto/health.dto';

export class HealthService {
  constructor(private readonly clock: Clock) {}

  check(): HealthDto {
    const health: HealthStatus = { status: 'ok', timestamp: this.clock.now() };
    return { status: health.status, timestamp: health.timestamp.toISOString() };
  }
}
