import type { Clock } from '../../domain/health/clock';
import type { DatabaseHealthCheck } from '../../domain/health/database-health-check';
import type { HealthStatus } from '../../domain/health/health-status';
import type { HealthDto } from '../dto/health.dto';

export class HealthService {
  constructor(
    private readonly clock: Clock,
    private readonly databaseHealthCheck: DatabaseHealthCheck,
  ) {}

  async check(): Promise<HealthDto> {
    const databaseUp = await this.databaseHealthCheck.isUp();
    const health: HealthStatus = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      timestamp: this.clock.now(),
    };
    return {
      status: health.status,
      database: health.database,
      timestamp: health.timestamp.toISOString(),
    };
  }
}
