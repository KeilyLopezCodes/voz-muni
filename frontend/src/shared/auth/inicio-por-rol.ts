import type { Rol } from './roles'

// Pantalla principal de cada rol según la sección 2.
export function inicioPorRol(rol: Rol): string {
  return rol === 'administrador' ? '/admin' : '/tickets'
}
