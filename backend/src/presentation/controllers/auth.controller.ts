import type { Request, Response } from 'express';
import type { AuthService } from '../../application/services/auth.service';
import { loginSchema, refreshTokenSchema } from '../validators/auth.validators';

// Solo traduce HTTP ↔ DTO. Un ZodError o un ErrorDeAplicacion los responde manejadorErrores.
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = loginSchema.parse(req.body);
    res.status(200).json(await this.authService.login(email, password));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    res.status(200).json(await this.authService.renovar(refreshToken));
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await this.authService.cerrarSesion(refreshToken);
    res.status(204).end();
  };

  // Va después de `autenticar`, que deja req.usuario.
  sesion = (req: Request, res: Response): void => {
    const { permisos, ...usuario } = req.usuario!;
    res.status(200).json({ usuario, permisos });
  };
}
