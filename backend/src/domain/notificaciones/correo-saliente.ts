// Reintentos de la bandeja de salida (RF-31, SPEC 34). Son constantes técnicas del canal, no valores municipales.
export const MAX_INTENTOS = 3;
// Espera después del intento 1 y del intento 2.
export const ESPERAS_REINTENTO_MIN = [5, 30] as const;

export type EstadoCorreo = 'pendiente' | 'enviado' | 'fallido' | 'descartado';

// Después de un fallo: el próximo intento, o null si ya no quedan (pasa a 'fallido').
export function proximoIntento(intentosHechos: number, ahora: Date): Date | null {
  if (intentosHechos >= MAX_INTENTOS) {
    return null;
  }
  const espera = ESPERAS_REINTENTO_MIN[intentosHechos - 1] ?? ESPERAS_REINTENTO_MIN.at(-1)!;
  return new Date(ahora.getTime() + espera * 60_000);
}

// true si el enlace del correo ya venció y no tiene sentido enviarlo.
export function debeDescartarse(expiraEn: Date | null, ahora: Date): boolean {
  return expiraEn !== null && expiraEn.getTime() < ahora.getTime();
}
