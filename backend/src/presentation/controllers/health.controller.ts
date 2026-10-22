import type { Request, Response } from 'express';
import type { HealthService } from '../../application/services/health.service';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  check = async (_req: Request, res: Response): Promise<void> => {
    const health = await this.healthService.check();
    res.status(health.database === 'up' ? 200 : 503).json(health);
  };
}
