import type { TipoRestablecimiento } from '../auth/token-service';

export interface RestablecimientoVigente {
  id: number;
  usuarioId: number;
  tipo: TipoRestablecimiento;
}

// Tokens de recuperación, invitación y verificación. Vigente = sin usar, sin invalidar y con expira_en posterior a `ahora`.
export interface RestablecimientoRepository {
  // Invalida los pendientes del usuario, sean del tipo que sean.
  invalidarPendientes(usuarioId: number, ahora: Date): Promise<void>;
  // expira_en = ahora + VIGENCIA_RESTABLECIMIENTO_MS[tipo].
  crear(usuarioId: number, tokenHash: string, tipo: TipoRestablecimiento, ahora: Date): Promise<void>;
  // Solo encuentra tokens de los `tipos` que acepta quien lo consume (SPEC 16): un token de verificación
  // no sirve en /auth/restablecer, ni uno de recuperación o invitación en /auth/verificar.
  buscarVigente(
    tokenHash: string,
    ahora: Date,
    tipos: readonly TipoRestablecimiento[],
  ): Promise<RestablecimientoVigente | null>;
  marcarUsado(id: number, ahora: Date): Promise<void>;
}
