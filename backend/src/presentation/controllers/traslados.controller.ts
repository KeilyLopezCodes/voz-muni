import type { Request, Response } from 'express';
import type { TrasladosService } from '../../application/services/traslados.service';
import {
  bandejaTrasladosSchema,
  idSchema,
  rechazoTrasladoSchema,
  solicitudTrasladoSchema,
} from '../validators/traslados.validators';

// Solo traduce HTTP ↔ DTO. Va después de autenticar y requierePermiso('tickets.trasladar'), que dejan usuario y alcance.
export class TrasladosController {
  constructor(private readonly traslados: TrasladosService) {}

  // 201 cuando crea una solicitud pendiente; 200 cuando el supervisor trasladó en el momento.
  solicitar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    const datos = solicitudTrasladoSchema.parse(req.body);
    const resultado = await this.traslados.solicitar(req.usuario!, req.alcance!, id, datos);
    res.status(resultado.ticket ? 200 : 201).json(resultado);
  };

  bandeja = async (req: Request, res: Response): Promise<void> => {
    const { estado, pagina, tamano } = bandejaTrasladosSchema.parse(req.query);
    res.status(200).json(await this.traslados.listar(estado, pagina, tamano));
  };

  aprobar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    res.status(200).json(await this.traslados.aprobar(req.usuario!, id));
  };

  rechazar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    const { motivo } = rechazoTrasladoSchema.parse(req.body);
    res.status(200).json(await this.traslados.rechazar(req.usuario!, id, motivo));
  };

  retirar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idSchema.parse(req.params);
    res.status(200).json(await this.traslados.retirar(req.usuario!, id));
  };

  dependencias = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.traslados.dependencias());
  };
}
