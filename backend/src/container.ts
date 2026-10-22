import { HealthService } from './application/services/health.service';
import { SystemClock } from './infrastructure/clock/system-clock';

export interface Container {
  healthService: HealthService;
}

// Único punto fuera de infrastructure/ que instancia sus adaptadores.
export function buildContainer(): Container {
  const clock = new SystemClock();
  return {
    healthService: new HealthService(clock),
  };
}
