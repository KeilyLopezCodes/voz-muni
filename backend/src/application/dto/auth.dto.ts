import type { Permisos } from '../../domain/auth/permisos';
import type { Rol } from '../../domain/auth/roles';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  rol: Rol;
  dependenciaId: number | null;
}

export interface RespuestaSesion {
  accessToken: string;
  accessExpiraEn: string; // ISO 8601 en UTC
  refreshToken: string;
  refreshExpiraEn: string; // ISO 8601 en UTC
  usuario: UsuarioSesion;
}

export interface UsuarioAutenticado extends UsuarioSesion {
  permisos: Permisos;
}
