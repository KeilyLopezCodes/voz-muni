import type { Request, Response } from 'express';
import type { PoliticasSlaService } from '../../application/services/politicas-sla.service';
import { idCategoriaSchema, matrizSlaSchema } from '../validators/politicas-sla.validators';

export class PoliticasSlaController {
  constructor(private readonly politicas: PoliticasSlaService) {}

  listar = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.politicas.listar());
  };

  reemplazar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCategoriaSchema.parse(req.params);
    const { plazos } = matrizSlaSchema.parse(req.body);
    res.status(200).json(await this.politicas.reemplazar(req.usuario!, id, plazos));
  };
}
