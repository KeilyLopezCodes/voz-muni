import type { Request, Response } from 'express';
import type { AsignacionService } from '../../application/services/asignacion.service';
import { asignacionSchema, idSchema, porAsignarSchema } from '../validators/asignacion.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.asignar'), que dejan el usuario.
export class AsignacionController {
  constructor(private readonly asignacion: AsignacionService) {}

  asignar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    const datos = asignacionSchema.parse(req.body);
    res.status(200).json(await this.asignacion.asignar(req.usuario!, id, datos));
  };

  porAsignar = async (req: Request, res: Response): Promise<void> => {
    const { vista, pagina, tamano } = porAsignarSchema.parse(req.query);
    res.status(200).json(await this.asignacion.listarPorAsignar(req.usuario!, vista, pagina, tamano));
  };

  tecnicos = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    res.status(200).json(await this.asignacion.tecnicos(req.usuario!, id));
  };
}
