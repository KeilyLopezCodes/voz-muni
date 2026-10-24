import type {
  CatalogoLecturaRepository,
  CategoriaConDependencia,
  Zona,
} from '../../domain/repositories/catalogo-lectura-repository';

// Catálogos para el formulario de queja del portal y de ventanilla (SPEC 14).
export class CatalogosService {
  constructor(private readonly catalogo: CatalogoLecturaRepository) {}

  listarCategorias(): Promise<CategoriaConDependencia[]> {
    return this.catalogo.listarCategoriasActivas();
  }

  listarZonas(): Promise<Zona[]> {
    return this.catalogo.listarZonas();
  }
}
