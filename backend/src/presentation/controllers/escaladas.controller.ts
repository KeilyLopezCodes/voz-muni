import type { Request, Response } from 'express';
import type { EscaladasService } from '../../application/services/escaladas.service';
import { escaladasSchema } from '../validators/escaladas.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.triage').
export class EscaladasController {
  constructor(private readonly escaladas: EscaladasService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const { dependenciaId, pagina, tamano } = escaladasSchema.parse(req.query);
    res.status(200).json(await this.escaladas.listar(req.usuario!, dependenciaId ?? null, pagina, tamano));
  };
}
