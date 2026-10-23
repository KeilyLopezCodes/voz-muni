import type { Request, Response } from 'express';
import type { RegistroVecinosService } from '../../application/services/registro-vecinos.service';
import { registroSchema, verificarSchema } from '../validators/registro.validators';

export class RegistroController {
  constructor(private readonly registroVecinos: RegistroVecinosService) {}

  // Siempre 202 con el mismo cuerpo: no revela si el correo o el DPI existen.
  registrar = async (req: Request, res: Response): Promise<void> => {
    res.status(202).json(await this.registroVecinos.registrar(registroSchema.parse(req.body)));
  };

  verificar = async (req: Request, res: Response): Promise<void> => {
    const { token } = verificarSchema.parse(req.body);
    res.status(200).json(await this.registroVecinos.verificar(token));
  };
}
