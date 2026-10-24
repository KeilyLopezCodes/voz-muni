import type { Request, Response } from 'express';
import type { LineaTiempoService } from '../../application/services/linea-tiempo.service';
import { lineaTiempoSchema } from '../validators/linea-tiempo.validators';
import { idTicketSchema } from '../validators/tickets.validators';

export class LineaTiempoController {
  constructor(private readonly lineaTiempo: LineaTiempoService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const { cursor, tamano } = lineaTiempoSchema.parse(req.query);
    res.status(200).json(await this.lineaTiempo.listar(req.usuario!, id, cursor, tamano));
  };
}
