// Reglas del registro (SPEC 16) replicadas del backend, que sigue siendo la fuente de verdad:
// domain/usuarios/vecino.ts, usuario-interno.ts (DPI) y auth/politica-password.ts (RNF-08).
// Cada función devuelve null si el valor es válido, o el código del problema.

export const NOMBRE_MAX = 150
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200

export type MotivoPassword = 'MUY_CORTA' | 'MUY_LARGA' | 'SIN_LETRA' | 'SIN_NUMERO'

export type CodigoRegistro =
  | 'NOMBRE_INVALIDO'
  | 'DPI_INVALIDO'
  | 'EMAIL_INVALIDO'
  | 'TELEFONO_INVALIDO'
  | 'CONFIRMACION_DISTINTA'
  | MotivoPassword

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LETRA = /\p{L}/u // incluye tildes y ñ
const NUMERO = /\p{Nd}/u

// Las longitudes se miden en caracteres, no en unidades UTF-16, como en el backend.
const largo = (texto: string) => [...texto].length

export function validarNombre(nombre: string): 'NOMBRE_INVALIDO' | null {
  const recortado = nombre.trim()
  return largo(recortado) < 1 || largo(recortado) > NOMBRE_MAX ? 'NOMBRE_INVALIDO' : null
}

// 13 dígitos; se aceptan espacios.
export function validarDpi(dpi: string): 'DPI_INVALIDO' | null {
  return /^\d{13}$/.test(dpi.replace(/\s+/g, '')) ? null : 'DPI_INVALIDO'
}

export function validarEmail(email: string): 'EMAIL_INVALIDO' | null {
  return CORREO.test(email.trim().toLowerCase()) ? null : 'EMAIL_INVALIDO'
}

// Opcional: vacío es válido. Si viene, 8 dígitos; se aceptan espacios y guiones.
export function validarTelefono(telefono: string): 'TELEFONO_INVALIDO' | null {
  if (telefono.trim() === '') {
    return null
  }
  return /^\d{8}$/.test(telefono.replace(/[\s-]+/g, '')) ? null : 'TELEFONO_INVALIDO'
}

// RNF-08: de 8 a 200 caracteres, sin recortar espacios, con al menos una letra y un dígito.
export function validarPassword(password: string): MotivoPassword | null {
  if (largo(password) < PASSWORD_MIN) {
    return 'MUY_CORTA'
  }
  if (largo(password) > PASSWORD_MAX) {
    return 'MUY_LARGA'
  }
  if (!LETRA.test(password)) {
    return 'SIN_LETRA'
  }
  if (!NUMERO.test(password)) {
    return 'SIN_NUMERO'
  }
  return null
}

export function validarConfirmacion(password: string, confirmacion: string): 'CONFIRMACION_DISTINTA' | null {
  return password === confirmacion ? null : 'CONFIRMACION_DISTINTA'
}
