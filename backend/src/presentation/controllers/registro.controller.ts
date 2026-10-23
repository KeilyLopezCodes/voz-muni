import type { Request, Response } from 'express';
import type { RegistroVecinosService } from '../../application/services/registro-vecinos.service';
import { registroSchema, verificarSchema } from '../validators/registro.validators';

// Mismo cuerpo en los 5 casos: no revela si el correo o el DPI ya existen.
const MENSAJE_REGISTRO = 'Revisa tu correo para continuar.';
const MENSAJE_VERIFICADO = 'Correo verificado. Ya puedes iniciar sesión.';

// Solo traduce HTTP ↔ DTO. Un ZodError o un ErrorDeAplicacion los responde manejadorErrores.
export class RegistroController {
  constructor(private readonly registroVecinosService: RegistroVecinosService) {}

  registrar = async (req: Request, res: Response): Promise<void> => {
    await this.registroVecinosService.registrar(registroSchema.parse(req.body));
    res.status(202).json({ mensaje: MENSAJE_REGISTRO });
  };

  verificar = async (req: Request, res: Response): Promise<void> => {
    const { token } = verificarSchema.parse(req.body);
    await this.registroVecinosService.verificar(token);
    res.status(200).json({ mensaje: MENSAJE_VERIFICADO });
  };
}
