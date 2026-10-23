export interface Sesion {
  id: number;
  usuarioId: number;
  expiraEn: Date;
  revocadaEn: Date | null;
}

export interface NuevaSesion {
  usuarioId: number;
  tokenHash: string;
  expiraEn: Date;
}

export interface SesionRepository {
  crear(sesion: NuevaSesion): Promise<number>;
  buscarPorHash(tokenHash: string): Promise<Sesion | null>;
  // En una transacción crea la sesión nueva y revoca la anterior apuntando a ella.
  // Devuelve null si la anterior ya estaba revocada (otra petición la rotó primero).
  rotar(anteriorId: number, nueva: NuevaSesion, ahora: Date): Promise<number | null>;
  // Solo si sigue vigente; no hace nada si ya estaba revocada.
  revocar(sesionId: number, ahora: Date): Promise<void>;
  revocarTodasDelUsuario(usuarioId: number, ahora: Date): Promise<void>;
}
