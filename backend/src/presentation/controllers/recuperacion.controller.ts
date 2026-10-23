import type { Request, Response } from 'express';
import type { RecuperacionService } from '../../application/services/recuperacion.service';
import { recuperarSchema, restablecerSchema } from '../validators/recuperacion.validators';

// Mismo cuerpo para cualquier correo: no revela cuáles están registrados.
const MENSAJE_RECUPERAR = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';

// Solo traduce HTTP ↔ DTO. Un ZodError o un ErrorDeAplicacion los responde manejadorErrores.
export class RecuperacionController {
  constructor(private readonly recuperacionService: RecuperacionService) {}

  recuperar = async (req: Request, res: Response): Promise<void> => {
    const { email } = recuperarSchema.parse(req.body);
    await this.recuperacionService.solicitar(email);
    res.status(202).json({ mensaje: MENSAJE_RECUPERAR });
  };

  restablecer = async (req: Request, res: Response): Promise<void> => {
    const { token, password } = restablecerSchema.parse(req.body);
    res.status(200).json(await this.recuperacionService.restablecer(token, password));
  };
}
