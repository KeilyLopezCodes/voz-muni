// Reglas de datos personales replicadas del backend, que sigue siendo la fuente de verdad:
// domain/usuarios/vecino.ts y usuario-interno.ts (DPI). Las usan el registro del vecino (SPEC 16)
// y el alta en ventanilla del formulario de queja (SPEC 18), así que viven en shared/.
// Cada función devuelve null si el valor es válido, o el código del problema.

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
