import type { EstadoBloqueo } from '../auth/bloqueo';
import type { Permisos } from '../auth/permisos';
import type { Rol } from '../auth/roles';

// Lo que necesita el login para verificar credenciales y aplicar el bloqueo.
export interface UsuarioConCredenciales {
  id: number;
  nombre: string;
  rol: Rol;
  dependenciaId: number | null;
  activo: boolean;
  passwordHash: string | null;
  bloqueo: EstadoBloqueo;
  correoVerificado: boolean; // sin verificar no se inicia sesión (SPEC 16)
}

// Usuario activo con los permisos actuales de su rol.
export interface UsuarioActivo {
  id: number;
  nombre: string;
  rol: Rol;
  dependenciaId: number | null;
  permisos: Permisos;
}

export interface UsuarioRepository {
  // El email se compara sin distinguir mayúsculas.
  buscarPorEmail(email: string): Promise<UsuarioConCredenciales | null>;
  guardarBloqueo(usuarioId: number, estado: EstadoBloqueo): Promise<void>;
  // Guarda el hash nuevo y limpia intentos fallidos y bloqueo.
  cambiarPassword(usuarioId: number, passwordHash: string): Promise<void>;
  // correo_verificado_en = ahora, solo si era null: abrir un enlace enviado al correo prueba que el buzón es del usuario.
  marcarCorreoVerificado(usuarioId: number, ahora: Date): Promise<void>;
  // null si no existe o está inactivo.
  buscarActivo(usuarioId: number): Promise<UsuarioActivo | null>;
  // null si no existe o no tiene correo.
  emailDe(usuarioId: number): Promise<string | null>;
}
