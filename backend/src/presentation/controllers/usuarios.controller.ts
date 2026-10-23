import type { Request, Response } from 'express';
import type { UsuariosService } from '../../application/services/usuarios.service';
import {
  altaUsuarioSchema,
  edicionUsuarioSchema,
  filtroUsuariosSchema,
  idUsuarioSchema,
} from '../validators/usuarios.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('admin.usuarios').
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.usuariosService.listar(filtroUsuariosSchema.parse(req.query)));
  };

  obtener = async (req: Request, res: Response): Promise<void> => {
    const { id } = idUsuarioSchema.parse(req.params);
    res.status(200).json(await this.usuariosService.obtener(id));
  };

  crear = async (req: Request, res: Response): Promise<void> => {
    const datos = altaUsuarioSchema.parse(req.body);
    res.status(201).json(
      await this.usuariosService.crear({
        ...datos,
        telefono: datos.telefono ?? null,
        dependenciaId: datos.dependenciaId ?? null,
      }),
    );
  };

  actualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idUsuarioSchema.parse(req.params);
    const cambios = edicionUsuarioSchema.parse(req.body);
    res.status(200).json(await this.usuariosService.actualizar(req.usuario!.id, id, cambios));
  };

  desactivar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idUsuarioSchema.parse(req.params);
    res.status(200).json(await this.usuariosService.desactivar(req.usuario!.id, id));
  };

  activar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idUsuarioSchema.parse(req.params);
    res.status(200).json(await this.usuariosService.activar(id));
  };

  desbloquear = async (req: Request, res: Response): Promise<void> => {
    const { id } = idUsuarioSchema.parse(req.params);
    res.status(200).json(await this.usuariosService.desbloquear(id));
  };
}
