// Bloqueo temporal por intentos fallidos de inicio de sesión (RNF-09).
export const MAX_INTENTOS = 5;
export const DURACION_BLOQUEO_MS = 15 * 60 * 1000;

export interface EstadoBloqueo {
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

export interface ResultadoFallo {
  estado: EstadoBloqueo;
  bloqueado: boolean; // true = este intento bloqueó la cuenta
}

export const SIN_BLOQUEO: EstadoBloqueo = { intentosFallidos: 0, bloqueadoHasta: null };

// Bloqueado mientras `ahora` sea anterior a `bloqueadoHasta`; en ese instante ya se desbloquea.
export function estaBloqueado(estado: EstadoBloqueo, ahora: Date): boolean {
  return estado.bloqueadoHasta !== null && estado.bloqueadoHasta.getTime() > ahora.getTime();
}

// Una contraseña incorrecta suma un intento. El intento MAX_INTENTOS bloquea y reinicia el contador.
export function registrarFallo(estado: EstadoBloqueo, ahora: Date): ResultadoFallo {
  const intentos = estado.intentosFallidos + 1;
  if (intentos >= MAX_INTENTOS) {
    return {
      estado: { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + DURACION_BLOQUEO_MS) },
      bloqueado: true,
    };
  }
  return { estado: { intentosFallidos: intentos, bloqueadoHasta: estado.bloqueadoHasta }, bloqueado: false };
}

// Un inicio de sesión correcto limpia intentos y bloqueo.
export function registrarExito(): EstadoBloqueo {
  return { ...SIN_BLOQUEO };
}
