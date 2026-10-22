import type { Request, Response } from 'express';
import type { HealthService } from '../../application/services/health.service';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  check = (_req: Request, res: Response): void => {
    res.status(200).json(this.healthService.check());
  };
}
