import type { Request, Response } from 'express';
import type { RegistroTicketsService } from '../../application/services/registro-tickets.service';
import { registroTicketSchema } from '../validators/tickets.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.crear'), que dejan usuario y alcance.
export class TicketsController {
  constructor(private readonly registroTickets: RegistroTicketsService) {}

  crear = async (req: Request, res: Response): Promise<void> => {
    const datos = registroTicketSchema.parse(req.body);
    const creado = await this.registroTickets.registrar(req.usuario!, req.alcance!, datos);
    res.status(201).location(`/api/v1/tickets/${creado.id}`).json(creado);
  };
}
