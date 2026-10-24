import type { Request, Response } from 'express';
import { z } from 'zod';
import type { NotificacionesService } from '../../application/services/notificaciones.service';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const marcarSchema = z.object({ leida: z.literal(true) }).strict();

export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.notificaciones.listar(req.usuario!));
  };

  marcar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    marcarSchema.parse(req.body);
    res.status(200).json(await this.notificaciones.marcarLeida(req.usuario!, id));
  };

  marcarTodas = async (req: Request, res: Response): Promise<void> => {
    await this.notificaciones.marcarTodas(req.usuario!);
    res.status(204).end();
  };
}
