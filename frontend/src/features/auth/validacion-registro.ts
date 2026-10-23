// Reglas del registro (SPEC 16), copia de las del backend. El backend sigue siendo la fuente de verdad.
// Cada regla devuelve null si el valor es válido, o la clave de traducción del error.

export interface DatosFormularioRegistro {
  nombre: string
  dpi: string
  email: string
  telefono: string
  password: string
  confirmacion: string
}

export type CampoRegistro = keyof DatosFormularioRegistro

const NOMBRE_MAX = 150
const PASSWORD_MIN = 8
const PASSWORD_MAX = 200
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LETRA = /\p{L}/u
const NUMERO = /\p{Nd}/u

const largo = (texto: string) => [...texto].length

export function validarNombre(nombre: string): string | null {
  const recortado = nombre.trim()
  return largo(recortado) < 1 || largo(recortado) > NOMBRE_MAX ? 'auth:registro.errores.nombre' : null
}

export function validarDpi(dpi: string): string | null {
  return /^\d{13}$/.test(dpi.replace(/\s+/g, '')) ? null : 'auth:registro.errores.dpi'
}

export function validarEmail(email: string): string | null {
  return CORREO.test(email.trim()) ? null : 'auth:registro.errores.email'
}

// Opcional: vacío es válido.
export function validarTelefono(telefono: string): string | null {
  const normalizado = telefono.replace(/[\s-]+/g, '')
  return normalizado === '' || /^\d{8}$/.test(normalizado) ? null : 'auth:registro.errores.telefono'
}

// Política de RNF-08: la longitud se mide en caracteres, sin recortar espacios.
export function validarPassword(password: string): string | null {
  if (largo(password) < PASSWORD_MIN) return 'auth:registro.errores.passwordCorta'
  if (largo(password) > PASSWORD_MAX) return 'auth:registro.errores.passwordLarga'
  if (!LETRA.test(password)) return 'auth:registro.errores.passwordSinLetra'
  if (!NUMERO.test(password)) return 'auth:registro.errores.passwordSinNumero'
  return null
}

export function validarConfirmacion(confirmacion: string, password: string): string | null {
  return confirmacion === password ? null : 'auth:registro.errores.confirmacion'
}

// Campo donde se muestra cada 400 del servidor. Los demás códigos van al aviso general.
export const CAMPO_POR_CODIGO: Partial<Record<string, CampoRegistro>> = {
  NOMBRE_INVALIDO: 'nombre',
  DPI_INVALIDO: 'dpi',
  EMAIL_INVALIDO: 'email',
  TELEFONO_INVALIDO: 'telefono',
  POLITICA_PASSWORD: 'password',
}

// Mensaje del campo para un 400 del servidor.
export const ERROR_SERVIDOR_POR_CAMPO: Record<Exclude<CampoRegistro, 'confirmacion'>, string> = {
  nombre: 'auth:registro.errores.nombre',
  dpi: 'auth:registro.errores.dpi',
  email: 'auth:registro.errores.email',
  telefono: 'auth:registro.errores.telefono',
  password: 'auth:registro.errores.politicaPassword',
}
