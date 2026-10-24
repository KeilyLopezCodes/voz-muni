import type { Request, Response } from 'express';
import type { ConsultaTicketsService } from '../../application/services/consulta-tickets.service';
import type { RegistroTicketsService } from '../../application/services/registro-tickets.service';
import { idTicketSchema, listadoTicketsSchema, registroTicketSchema } from '../validators/tickets.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso, que dejan usuario y alcance.
export class TicketsController {
  constructor(
    private readonly registroTickets: RegistroTicketsService,
    private readonly consultaTickets: ConsultaTicketsService,
  ) {}

  crear = async (req: Request, res: Response): Promise<void> => {
    const datos = registroTicketSchema.parse(req.body);
    const creado = await this.registroTickets.registrar(req.usuario!, req.alcance!, datos);
    res.status(201).location(`/api/v1/tickets/${creado.id}`).json(creado);
  };

  listar = async (req: Request, res: Response): Promise<void> => {
    const { pagina, tamano } = listadoTicketsSchema.parse(req.query);
    res.status(200).json(await this.consultaTickets.listarParaUsuario(req.usuario!, pagina, tamano));
  };

  detalle = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    res.status(200).json(await this.consultaTickets.detalle(req.usuario!, id));
  };
}
