import type { Request, Response } from 'express';
import type { VecinosService } from '../../application/services/vecinos.service';
import { altaVecinoSchema, busquedaVecinoSchema } from '../validators/vecinos.validators';

export class VecinosController {
  constructor(private readonly vecinosService: VecinosService) {}

  buscar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.vecinosService.buscar(busquedaVecinoSchema.parse(req.query)));
  };

  crear = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.vecinosService.crear(req.usuario!.id, altaVecinoSchema.parse(req.body)));
  };
}
