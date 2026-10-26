import type { Request, Response } from 'express';
import type { NotificacionesService } from '../../application/services/notificaciones.service';
import { idNotificacionSchema, marcarNotificacionSchema } from '../validators/notificaciones.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar: cada usuario opera sobre sus propias notificaciones.
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.notificaciones.listar(req.usuario!));
  };

  marcar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idNotificacionSchema.parse(req.params);
    marcarNotificacionSchema.parse(req.body);
    res.status(200).json(await this.notificaciones.marcarLeida(req.usuario!, id));
  };

  marcarTodas = async (req: Request, res: Response): Promise<void> => {
    await this.notificaciones.marcarTodasLeidas(req.usuario!);
    res.status(204).end();
  };
}
