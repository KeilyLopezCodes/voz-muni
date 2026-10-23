import { DURACION_RENOVACION_MS, type TokenService } from '../../domain/auth/token-service';
import type { SesionRepository } from '../../domain/repositories/sesion-repository';
import type { RespuestaSesion, UsuarioSesion } from '../dto/auth.dto';

// Tokens de acceso y renovación que devuelven el login, la renovación y el restablecimiento.
export function respuestaSesion(
  tokens: TokenService,
  usuario: UsuarioSesion,
  refreshToken: string,
  refreshExpiraEn: Date,
  ahora: Date,
): RespuestaSesion {
  const acceso = tokens.emitirAcceso({ sub: String(usuario.id), rol: usuario.rol, dep: usuario.dependenciaId }, ahora);
  return {
    accessToken: acceso.token,
    accessExpiraEn: acceso.expiraEn.toISOString(),
    refreshToken,
    refreshExpiraEn: refreshExpiraEn.toISOString(),
    usuario,
  };
}

// Crea una sesión nueva (solo se guarda el hash del token de renovación) y emite sus tokens.
export async function abrirSesion(
  tokens: TokenService,
  sesiones: SesionRepository,
  usuario: UsuarioSesion,
  ahora: Date,
): Promise<RespuestaSesion> {
  const refreshToken = tokens.generarRenovacion();
  const refreshExpiraEn = new Date(ahora.getTime() + DURACION_RENOVACION_MS);
  await sesiones.crear({ usuarioId: usuario.id, tokenHash: tokens.hashRenovacion(refreshToken), expiraEn: refreshExpiraEn });
  return respuestaSesion(tokens, usuario, refreshToken, refreshExpiraEn, ahora);
}
