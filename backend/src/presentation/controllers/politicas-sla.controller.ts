import type { Request, Response } from 'express';
import type { PoliticasSlaService } from '../../application/services/politicas-sla.service';
import { idCategoriaSchema, politicasSlaSchema } from '../validators/politicas-sla.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('admin.catalogos').
export class PoliticasSlaController {
  constructor(private readonly politicasSla: PoliticasSlaService) {}

  listar = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.politicasSla.listar());
  };

  reemplazar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCategoriaSchema.parse(req.params);
    const { plazos } = politicasSlaSchema.parse(req.body);
    res.status(200).json(await this.politicasSla.reemplazar(req.usuario!, id, plazos));
  };
}
