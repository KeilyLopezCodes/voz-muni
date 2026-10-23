import type { Rol } from './roles';

export const DURACION_ACCESO_MS = 15 * 60 * 1000;
export const DURACION_RENOVACION_MS = 7 * 24 * 60 * 60 * 1000;
export const DURACION_RESTABLECIMIENTO_MS = 30 * 60 * 1000;

// Contenido del token de acceso. Los permisos no viajan en el token: se leen de la base en cada petición.
export interface PayloadAcceso {
  sub: string; // id del usuario
  rol: Rol;
  dep: number | null; // dependencia_id
}

export interface TokenEmitido {
  token: string;
  expiraEn: Date;
}

// Puerto: la infraestructura firma JWT y genera tokens aleatorios; las pruebas usan un falso.
export interface TokenService {
  emitirAcceso(payload: PayloadAcceso, ahora: Date): TokenEmitido;
  // null si la firma es inválida o el token venció.
  verificarAcceso(token: string, ahora: Date): PayloadAcceso | null;
  // 32 bytes aleatorios. También sirve para el token de recuperación de contraseña.
  generarRenovacion(): string;
  // SHA-256: lo único que se guarda de un token de renovación o de recuperación.
  hashRenovacion(token: string): string;
}
