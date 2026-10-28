import type { Request, Response } from 'express';
import type { GestionTicketsService } from '../../application/services/gestion-tickets.service';
import { gestionTicketsSchema, opcionesGestionSchema } from '../validators/gestion-tickets.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.ver', alcances internos).
export class GestionTicketsController {
  constructor(private readonly gestion: GestionTicketsService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const { estado, ...consulta } = gestionTicketsSchema.parse(req.query);
    res.status(200).json(await this.gestion.listar(req.usuario!, { ...consulta, estados: estado ?? [] }));
  };

  opciones = async (req: Request, res: Response): Promise<void> => {
    opcionesGestionSchema.parse(req.query);
    res.status(200).json(await this.gestion.opciones(req.usuario!));
  };
}
