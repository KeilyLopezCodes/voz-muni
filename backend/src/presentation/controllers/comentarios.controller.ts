import type { Request, Response } from 'express';
import type { ComentariosService } from '../../application/services/comentarios.service';
import { verificarPermiso } from '../middlewares/requiere-permiso';
import {
  comentarioSchema,
  edicionComentarioSchema,
  idComentarioSchema,
  idTicketSchema,
} from '../validators/comentarios.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar.
export class ComentariosController {
  constructor(private readonly comentarios: ComentariosService) {}

  // El permiso depende del cuerpo: comentarios.interno para una nota interna, comentarios.publico si no.
  comentar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    const datos = comentarioSchema.parse(req.body);
    verificarPermiso(req, datos.interno ? 'comentarios.interno' : 'comentarios.publico');
    res.status(201).json(await this.comentarios.comentar(req.usuario!, id, datos));
  };

  listar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idTicketSchema.parse(req.params);
    res.status(200).json(await this.comentarios.listar(req.usuario!, id));
  };

  editar = async (req: Request, res: Response): Promise<void> => {
    const { id, comentarioId } = idComentarioSchema.parse(req.params);
    const { cuerpo } = edicionComentarioSchema.parse(req.body);
    res.status(200).json(await this.comentarios.editar(req.usuario!, id, comentarioId, cuerpo));
  };
}
