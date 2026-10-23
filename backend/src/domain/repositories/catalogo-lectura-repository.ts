import type { CampoExtra } from '../categorias/campo-extra';

export interface CategoriaFormulario {
  id: number;
  nombre: string;
  camposExtra: CampoExtra[];
}

export interface Zona {
  id: number;
  nombre: string;
  tipo: string; // zona, colonia o aldea
}

// Catálogos que usa el registro de una queja (SPEC 12) y su formulario (SPEC 14).
export interface CatalogoLecturaRepository {
  // La categoría existe y está activa, y su dependencia también.
  categoriaRegistrable(categoriaId: number): Promise<boolean>;
  zonaExiste(zonaId: number): Promise<boolean>;
  // Solo las activas con dependencia activa, ordenadas por nombre.
  listarCategoriasActivas(): Promise<CategoriaFormulario[]>;
  // Ordenadas por tipo y nombre.
  listarZonas(): Promise<Zona[]>;
}
