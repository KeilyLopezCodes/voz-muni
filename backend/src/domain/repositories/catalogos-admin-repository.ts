import type { TipoZona } from '../catalogos/zona';

// Administración de dependencias, categorías y zonas (RF-41, SPEC 40). Se usa dentro de una Transaccion. Ningún
// método borra: los registros solo se desactivan. Un nombre repetido (sin distinguir mayúsculas; en las zonas,
// dentro del mismo tipo) lanza ReglaDeNegocioError NOMBRE_DUPLICADO.

export interface DependenciaAdmin {
  id: number;
  nombre: string;
  activa: boolean;
  categoriasActivas: number;
  usuariosActivos: number;
  quejasAbiertas: number; // estados no finales
}

export interface CategoriaAdmin {
  id: number;
  nombre: string;
  activa: boolean;
  dependencia: { id: number; nombre: string; activa: boolean };
  camposExtra: number; // cantidad de campos definidos (SPEC 14)
  slaCompleto: boolean; // las 4 prioridades en politicas_sla (SPEC 29)
}

export interface ZonaAdmin {
  id: number;
  nombre: string;
  tipo: TipoZona;
  activa: boolean;
}

export interface CambiosDependencia {
  nombre?: string;
  activa?: boolean;
}

export interface CambiosCategoria {
  nombre?: string;
  dependenciaId?: number;
  activa?: boolean;
}

export interface CambiosZona {
  nombre?: string;
  tipo?: TipoZona;
  activa?: boolean;
}

export interface CatalogosAdminRepository {
  // Activas e inactivas, ordenadas por nombre, con sus contadores de uso.
  listarDependencias(): Promise<DependenciaAdmin[]>;
  dependencia(id: number): Promise<DependenciaAdmin | null>;
  // SELECT … FOR UPDATE de la dependencia. null si no existe.
  bloquearDependencia(id: number): Promise<{ id: number; activa: boolean } | null>;
  // SELECT … FOR SHARE: la dependencia no se desactiva mientras se crea, mueve o activa una de sus categorías.
  dependenciaActiva(id: number): Promise<boolean | null>;
  // Las categorías activas de la dependencia, bloqueadas (FOR UPDATE) para que nadie active otra a la vez.
  bloquearCategoriasActivas(dependenciaId: number): Promise<{ id: number; nombre: string }[]>;
  crearDependencia(nombre: string): Promise<number>;
  actualizarDependencia(id: number, cambios: CambiosDependencia): Promise<void>;

  listarCategorias(): Promise<CategoriaAdmin[]>;
  categoria(id: number): Promise<CategoriaAdmin | null>;
  // SELECT … FOR UPDATE de la categoría. null si no existe.
  bloquearCategoria(id: number): Promise<{ id: number; activa: boolean; dependenciaId: number } | null>;
  slaCompleto(categoriaId: number): Promise<boolean>;
  // Nace inactiva y con campos_extra vacío.
  crearCategoria(nombre: string, dependenciaId: number): Promise<number>;
  actualizarCategoria(id: number, cambios: CambiosCategoria): Promise<void>;

  // Ordenadas por tipo y nombre.
  listarZonas(): Promise<ZonaAdmin[]>;
  zona(id: number): Promise<ZonaAdmin | null>;
  bloquearZona(id: number): Promise<{ id: number } | null>;
  crearZona(nombre: string, tipo: TipoZona): Promise<number>;
  actualizarZona(id: number, cambios: CambiosZona): Promise<void>;
}
