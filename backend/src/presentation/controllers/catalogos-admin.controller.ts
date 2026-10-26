import type { Request, Response } from 'express';
import type { CatalogosAdminService } from '../../application/services/catalogos-admin.service';
import {
  cambiosCategoriaSchema,
  cambiosDependenciaSchema,
  cambiosZonaSchema,
  idCatalogoSchema,
  nuevaCategoriaSchema,
  nuevaDependenciaSchema,
  nuevaZonaSchema,
} from '../validators/catalogos-admin.validators';

// Solo traduce HTTP ↔ DTO (SPEC 40). No hay DELETE: los catálogos se desactivan.
export class CatalogosAdminController {
  constructor(private readonly catalogos: CatalogosAdminService) {}

  listarDependencias = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.catalogos.listarDependencias());
  };

  crearDependencia = async (req: Request, res: Response): Promise<void> => {
    const { nombre } = nuevaDependenciaSchema.parse(req.body);
    res.status(201).json(await this.catalogos.crearDependencia(nombre));
  };

  editarDependencia = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCatalogoSchema.parse(req.params);
    res.status(200).json(await this.catalogos.editarDependencia(id, cambiosDependenciaSchema.parse(req.body)));
  };

  listarCategorias = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.catalogos.listarCategorias());
  };

  crearCategoria = async (req: Request, res: Response): Promise<void> => {
    const { nombre, dependenciaId } = nuevaCategoriaSchema.parse(req.body);
    res.status(201).json(await this.catalogos.crearCategoria(nombre, dependenciaId));
  };

  editarCategoria = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCatalogoSchema.parse(req.params);
    res.status(200).json(await this.catalogos.editarCategoria(id, cambiosCategoriaSchema.parse(req.body)));
  };

  listarZonas = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.catalogos.listarZonas());
  };

  crearZona = async (req: Request, res: Response): Promise<void> => {
    const { nombre, tipo } = nuevaZonaSchema.parse(req.body);
    res.status(201).json(await this.catalogos.crearZona(nombre, tipo));
  };

  editarZona = async (req: Request, res: Response): Promise<void> => {
    const { id } = idCatalogoSchema.parse(req.params);
    res.status(200).json(await this.catalogos.editarZona(id, cambiosZonaSchema.parse(req.body)));
  };
}
