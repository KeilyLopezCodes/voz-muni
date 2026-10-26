import type { Request, Response } from 'express';
import type { ParametrosService } from '../../application/services/parametros.service';
import { limitesMunicipioSchema } from '../validators/parametros.validators';

export class ParametrosController {
  constructor(private readonly parametrosService: ParametrosService) {}

  obtenerLimites = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ limites: await this.parametrosService.obtenerLimites() });
  };

  guardarLimites = async (req: Request, res: Response): Promise<void> => {
    const valor = limitesMunicipioSchema.parse(req.body);
    res.status(200).json({ limites: await this.parametrosService.guardarLimites(req.usuario!.id, valor) });
  };
}
