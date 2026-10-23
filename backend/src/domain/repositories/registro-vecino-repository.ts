import type { UsuarioParaRegistro } from '../usuarios/registro-vecino';

// Datos ya validados de un registro del portal (SPEC 16), con la contraseña ya hasheada.
export interface NuevoRegistro {
  nombre: string;
  dpi: string;
  email: string;
  telefono: string | null;
  passwordHash: string;
}

export interface UsuariosParaRegistro {
  porCorreo: UsuarioParaRegistro | null; // lower(email) igual al ingresado
  porDpi: UsuarioParaRegistro | null;
}

// Registro propio del vecino y verificación de su correo (RF-01).
export interface RegistroVecinoRepository {
  // Dentro de una transacción bloquea las filas encontradas, para decidir el caso sin carreras.
  buscarParaRegistro(email: string, dpi: string): Promise<UsuariosParaRegistro>;
  // Vecino activo, con contraseña y sin verificar. Lanza EMAIL_DUPLICADO o DPI_DUPLICADO si otro registro ganó la carrera.
  crearPendiente(datos: NuevoRegistro): Promise<{ id: number }>;
  // Reemplaza nombre, DPI, teléfono y contraseña de un registro que sigue sin verificar.
  reemplazarPendiente(usuarioId: number, datos: NuevoRegistro): Promise<void>;
  // correo_verificado_en = ahora, solo si todavía no estaba verificado.
  marcarVerificado(usuarioId: number, ahora: Date): Promise<void>;
}
