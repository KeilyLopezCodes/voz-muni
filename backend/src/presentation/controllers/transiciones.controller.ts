import type { Request, Response } from 'express';
import type { TriageService } from '../../application/services/triage.service';
import { idTicketSchema, transicionSchema } from '../validators/transiciones.validators';
import { bandejaTriageSchema } from '../validators/triage.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.triage'), que dejan el usuario.
export class TransicionesController {
  constructor(private readonly triage: TriageService) {}

  transicionar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const comando = transicionSchema.parse(req.body);
    res.status(200).json(await this.triage.transicionar(req.usuario!, id, comando));
  };

  bandeja = async (req: Request, res: Response): Promise<void> => {
    const { estados, pagina, tamano } = bandejaTriageSchema.parse(req.query);
    res.status(200).json(await this.triage.listar(req.usuario!, estados, pagina, tamano));
  };
}
