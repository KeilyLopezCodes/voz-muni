import type { Request, Response } from 'express';
import type { CamposExtraService } from '../../application/services/campos-extra.service';
import { camposExtraSchema, idCategoriaSchema } from '../validators/campos-extra.validators';

export class CamposExtraController {
  constructor(private readonly camposExtraService: CamposExtraService) {}

  actualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCategoriaSchema.parse(req.params);
    const { campos } = camposExtraSchema.parse(req.body);
    res.status(200).json(await this.camposExtraService.actualizar(req.usuario!.id, id, campos));
  };
}
