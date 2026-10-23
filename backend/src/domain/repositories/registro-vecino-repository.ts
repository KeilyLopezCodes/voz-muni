import type { UsuarioParaRegistro } from '../usuarios/registro-vecino';

export interface DatosCuentaVecino {
  nombre: string;
  dpi: string;
  email: string;
  telefono: string | null;
  passwordHash: string;
}

// Registro propio del vecino (SPEC 16). Se usa dentro de una Transaccion.
export interface RegistroVecinoRepository {
  // Por correo sin distinguir mayúsculas. Bloquea la fila (FOR UPDATE) hasta el commit.
  buscarPorCorreo(email: string): Promise<UsuarioParaRegistro | null>;
  buscarPorDpi(dpi: string): Promise<UsuarioParaRegistro | null>;
  // Vecino activo, con contraseña y sin verificar. Lanza EMAIL_DUPLICADO o DPI_DUPLICADO por concurrencia.
  crear(datos: DatosCuentaVecino): Promise<{ id: number }>;
  // Reemplaza nombre, DPI, teléfono y contraseña de un registro pendiente. Lanza DPI_DUPLICADO por concurrencia.
  reemplazarPendiente(usuarioId: number, datos: Omit<DatosCuentaVecino, 'email'>): Promise<void>;
}
