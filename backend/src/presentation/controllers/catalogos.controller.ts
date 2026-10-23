import type { Request, Response } from 'express';
import type { CatalogosService } from '../../application/services/catalogos.service';

export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  categorias = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.catalogosService.listarCategorias());
  };

  zonas = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.catalogosService.listarZonas());
  };
}
