import { apiClient } from '../../../shared/api/http-client'

// Contratos de SPEC 40: /admin/{dependencias,categorias,zonas}, solo para el administrador (admin.catalogos). No hay
// DELETE: los catálogos se desactivan.

export const TIPOS_ZONA = ['zona', 'colonia', 'aldea'] as const
export type TipoZona = (typeof TIPOS_ZONA)[number]

export interface DependenciaAdmin {
  id: number
  nombre: string
  activa: boolean
  categoriasActivas: number
  usuariosActivos: number
  quejasAbiertas: number
}

export interface CategoriaAdmin {
  id: number
  nombre: string
  activa: boolean
  dependencia: { id: number; nombre: string; activa: boolean }
  camposExtra: number // cantidad de campos adicionales (SPEC 14)
  slaCompleto: boolean // SPEC 29
}

export interface ZonaAdmin {
  id: number
  nombre: string
  tipo: TipoZona
  activa: boolean
}

export const CLAVES_CATALOGOS = {
  dependencias: ['admin', 'dependencias'] as const,
  categorias: ['admin', 'categorias'] as const,
  zonas: ['admin', 'zonas'] as const,
}

const listar = <T>(ruta: string) => async (): Promise<T[]> => (await apiClient.get<{ datos: T[] }>(ruta)).datos

export const listarDependencias = listar<DependenciaAdmin>('/admin/dependencias')
export const crearDependencia = (nombre: string) => apiClient.post<DependenciaAdmin>('/admin/dependencias', { nombre })
export const editarDependencia = (id: number, cambios: { nombre?: string; activa?: boolean }) =>
  apiClient.patch<DependenciaAdmin>(`/admin/dependencias/${id}`, cambios)

export const listarCategorias = listar<CategoriaAdmin>('/admin/categorias')
export const crearCategoria = (nombre: string, dependenciaId: number) =>
  apiClient.post<CategoriaAdmin>('/admin/categorias', { nombre, dependenciaId })
export const editarCategoria = (id: number, cambios: { nombre?: string; dependenciaId?: number; activa?: boolean }) =>
  apiClient.patch<CategoriaAdmin>(`/admin/categorias/${id}`, cambios)

export const listarZonas = listar<ZonaAdmin>('/admin/zonas')
export const crearZona = (nombre: string, tipo: TipoZona) => apiClient.post<ZonaAdmin>('/admin/zonas', { nombre, tipo })
export const editarZona = (id: number, cambios: { nombre?: string; tipo?: TipoZona; activa?: boolean }) =>
  apiClient.patch<ZonaAdmin>(`/admin/zonas/${id}`, cambios)
