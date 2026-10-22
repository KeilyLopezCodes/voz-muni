export interface HealthDto {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: string; // ISO 8601 en UTC
}
