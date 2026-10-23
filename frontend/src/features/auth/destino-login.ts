import { inicioPorRol } from '../../shared/auth/inicio-por-rol'
import type { Rol } from '../../shared/auth/roles'
import { RUTAS_PROTEGIDAS } from '../../shared/auth/rutas'

// A dónde ir después de iniciar sesión (SPEC 17): a la página que se intentó abrir (state.desde)
// si es una ruta interna que el rol puede usar; si no, al inicio del rol.
export function destinoTrasLogin(rol: Rol, estado: unknown): string {
  const desde = desdeDelEstado(estado)
  if (desde === null) {
    return inicioPorRol(rol)
  }
  const ruta = desde.split(/[?#]/, 1)[0]
  const permitida = RUTAS_PROTEGIDAS.some((protegida) => protegida.path === ruta && protegida.roles.includes(rol))
  return permitida ? desde : inicioPorRol(rol)
}

// Solo rutas internas: empieza con "/" y no con "//" ni "/\" (que el navegador trata como otro sitio).
function desdeDelEstado(estado: unknown): string | null {
  if (!estado || typeof estado !== 'object' || !('desde' in estado) || typeof estado.desde !== 'string') {
    return null
  }
  const desde = estado.desde
  return desde.startsWith('/') && !desde.startsWith('//') && !desde.startsWith('/\\') ? desde : null
}
