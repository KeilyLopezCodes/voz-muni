import type { RolInterno } from '../usuarios/usuario-interno';

// Usuario con rol interno, tal como lo gestiona el administrador (RF-04). Los vecinos nunca aparecen aquí.
export interface UsuarioInterno {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  dpi: string | null; // null solo en usuarios creados antes de SPEC 10, como los de seed:dev
  rol: RolInterno;
  dependenciaId: number | null;
  activo: boolean;
  tienePassword: boolean;
  bloqueadoHasta: Date | null;
}

export interface FiltroUsuarios {
  pagina: number; // desde 1
  tamano: number;
  rol?: RolInterno;
  dependenciaId?: number;
  activo?: boolean;
  busqueda?: string; // nombre o email, sin distinguir mayúsculas
}

export interface NuevoUsuarioInterno {
  nombre: string;
  email: string; // en minúsculas
  dpi: string; // 13 dígitos
  telefono: string | null;
  rol: RolInterno;
  dependenciaId: number | null;
}

export interface CambiosUsuarioInterno {
  nombre?: string;
  telefono?: string | null;
  rol?: RolInterno;
  dependenciaId?: number | null;
  activo?: boolean;
  desbloquear?: true; // intentos_fallidos = 0 y bloqueado_hasta = null
}

export interface UsuarioAdminRepository {
  // Ordenado por nombre y luego id.
  listar(filtro: FiltroUsuarios): Promise<{ datos: UsuarioInterno[]; total: number }>;
  // null si no existe o es un vecino.
  obtenerInterno(id: number): Promise<UsuarioInterno | null>;
  // Lanza ReglaDeNegocioError EMAIL_DUPLICADO o DPI_DUPLICADO, también si el existente es un vecino.
  crear(nuevo: NuevoUsuarioInterno): Promise<UsuarioInterno>;
  actualizar(id: number, cambios: CambiosUsuarioInterno): Promise<UsuarioInterno>;
  // Bloquea las filas (FOR UPDATE): dentro de una transacción, dos operaciones simultáneas no dejan 0 administradores.
  contarAdminsActivosParaActualizar(): Promise<number>;
  dependenciaActiva(dependenciaId: number): Promise<boolean>;
}
