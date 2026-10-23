import type { TipoRestablecimiento } from '../auth/token-service';

export interface RestablecimientoVigente {
  id: number;
  usuarioId: number;
  tipo: TipoRestablecimiento;
}

// Tokens de recuperación e invitación. Vigente = sin usar, sin invalidar y con expira_en posterior a `ahora`.
export interface RestablecimientoRepository {
  // Invalida los pendientes del usuario, sean del tipo que sean.
  invalidarPendientes(usuarioId: number, ahora: Date): Promise<void>;
  // expira_en = ahora + VIGENCIA_RESTABLECIMIENTO_MS[tipo].
  crear(usuarioId: number, tokenHash: string, tipo: TipoRestablecimiento, ahora: Date): Promise<void>;
  // Solo si su tipo es uno de `tipos`: un token de verificación no sirve en /auth/restablecer, ni al revés (SPEC 16).
  buscarVigente(
    tokenHash: string,
    ahora: Date,
    tipos: readonly TipoRestablecimiento[],
  ): Promise<RestablecimientoVigente | null>;
  marcarUsado(id: number, ahora: Date): Promise<void>;
}
