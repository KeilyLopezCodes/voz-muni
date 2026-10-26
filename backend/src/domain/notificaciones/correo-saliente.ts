// Ciclo de un correo de la bandeja de salida (RF-31, SPEC 34). Son constantes técnicas del canal de envío, no
// valores municipales: por eso no viven en parametros.

export const MAX_INTENTOS = 3;
// Espera después del intento 1 y del intento 2.
export const ESPERAS_REINTENTO_MIN = [5, 30] as const;

export const ESTADOS_CORREO = ['pendiente', 'enviado', 'fallido', 'descartado'] as const;

export type EstadoCorreo = (typeof ESTADOS_CORREO)[number];

const MS_POR_MINUTO = 60_000;

// Después de un fallo: el próximo intento, o null si ya no quedan (pasa a 'fallido'). `intentosHechos` cuenta el
// intento que acaba de fallar.
export function proximoIntento(intentosHechos: number, ahora: Date): Date | null {
  if (intentosHechos >= MAX_INTENTOS) {
    return null;
  }
  const espera = ESPERAS_REINTENTO_MIN[intentosHechos - 1];
  return new Date(ahora.getTime() + espera * MS_POR_MINUTO);
}

// true si el enlace del correo ya venció y no tiene sentido enviarlo (por ejemplo, una recuperación de 30 minutos
// que no salió a tiempo). En el instante exacto todavía sirve.
export function debeDescartarse(expiraEn: Date | null, ahora: Date): boolean {
  return expiraEn !== null && expiraEn.getTime() < ahora.getTime();
}
