// Catálogos que valida el registro de una queja (SPEC 12).
export interface CatalogoLecturaRepository {
  // La categoría existe y está activa, y su dependencia también.
  categoriaRegistrable(categoriaId: number): Promise<boolean>;
  zonaExiste(zonaId: number): Promise<boolean>;
}
