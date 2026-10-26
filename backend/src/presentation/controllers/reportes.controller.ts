import type { Request, Response } from 'express';
import type { ReportesService } from '../../application/services/reportes.service';
import { resumenReportesSchema } from '../validators/reportes.validators';

// Solo traduce HTTP ↔ DTO (SPEC 43).
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  resumen = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.reportes.resumen(req.usuario!, resumenReportesSchema.parse(req.query)));
  };
}
