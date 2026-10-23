import type { RolInterno } from '../../domain/usuarios/usuario-interno';

export interface UsuarioInternoDto {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  dpi: string | null; // 13 dígitos completos (el endpoint es solo de admin); null en usuarios anteriores a SPEC 10
  rol: RolInterno;
  dependenciaId: number | null;
  activo: boolean;
  tienePassword: boolean; // false = invitación pendiente
  bloqueadoHasta: string | null; // ISO 8601 en UTC
}

export interface PaginaUsuarios {
  datos: UsuarioInternoDto[];
  pagina: number;
  tamano: number;
  total: number;
}

export interface UsuarioCreadoDto {
  usuario: UsuarioInternoDto;
  invitacionEnviada: boolean;
}

export interface DatosAltaUsuario {
  nombre: string;
  email: string; // en minúsculas
  dpi: string; // se aceptan espacios
  telefono: string | null;
  rol: string; // se valida contra ROLES_INTERNOS
  dependenciaId: number | null;
}

export interface DatosEdicionUsuario {
  nombre?: string;
  telefono?: string | null;
  rol?: string;
  dependenciaId?: number | null;
}

export interface FiltroUsuariosDto {
  pagina: number;
  tamano: number;
  rol?: string;
  dependenciaId?: number;
  activo?: boolean;
  busqueda?: string;
}
