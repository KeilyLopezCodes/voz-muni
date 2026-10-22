import type { Clock } from '../../domain/health/clock';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
