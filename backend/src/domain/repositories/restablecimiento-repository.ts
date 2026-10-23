// Tokens de recuperación de contraseña. Vigente = sin usar, sin invalidar y con expira_en posterior a `ahora`.
export interface RestablecimientoRepository {
  invalidarPendientes(usuarioId: number, ahora: Date): Promise<void>;
  crear(usuarioId: number, tokenHash: string, expiraEn: Date): Promise<void>;
  buscarVigente(tokenHash: string, ahora: Date): Promise<{ id: number; usuarioId: number } | null>;
  marcarUsado(id: number, ahora: Date): Promise<void>;
}
