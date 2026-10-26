import type { Request, Response } from 'express';
import type { EncuestasService } from '../../application/services/encuestas.service';
import { calificacionSchema } from '../validators/encuestas.validators';
import { idTicketSchema } from '../validators/tickets.validators';

// Solo traduce HTTP ↔ DTO (SPEC 39).
export class EncuestasController {
  constructor(private readonly encuestas: EncuestasService) {}

  calificar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const datos = calificacionSchema.parse(req.body);
    res.status(201).json(await this.encuestas.calificar(req.usuario!, id, datos));
  };
}
