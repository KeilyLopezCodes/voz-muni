// Dónde vive el token de renovación (SPEC 17). El de acceso nunca se guarda aquí: vive solo en memoria.
export const CLAVE_REFRESH = 'vozmuni.refreshToken'

// Copia en memoria para cuando localStorage no está disponible (modo privado estricto, almacenamiento
// bloqueado): la sesión funciona, pero dura solo mientras la pestaña esté abierta.
let respaldo: string | null = null

export function leerRefresh(): string | null {
  try {
    return localStorage.getItem(CLAVE_REFRESH)
  } catch {
    return respaldo
  }
}

export function guardarRefresh(token: string): void {
  respaldo = token
  try {
    localStorage.setItem(CLAVE_REFRESH, token)
  } catch {
    // Sin localStorage queda solo el respaldo en memoria.
  }
}

export function borrarRefresh(): void {
  respaldo = null
  try {
    localStorage.removeItem(CLAVE_REFRESH)
  } catch {
    // Nada que borrar fuera de la memoria.
  }
}
