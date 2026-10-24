import type { Rol } from './roles'

export interface RutaProtegida {
  path: string
  roles: readonly Rol[]
  etiqueta: string // clave i18n
  enMenu: boolean
}

// Fuente única para guardas y menú, derivada de la matriz de permisos (sección 2).
export const RUTAS_PROTEGIDAS: readonly RutaProtegida[] = [
  {
    path: '/tickets',
    roles: ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'],
    etiqueta: 'comun:menu.tickets',
    enMenu: true,
  },
  {
    path: '/tickets/nueva',
    roles: ['vecino', 'receptor', 'supervisor'],
    etiqueta: 'comun:menu.nuevoTicket',
    enMenu: true,
  },
  {
    path: '/triage',
    roles: ['supervisor'],
    etiqueta: 'comun:menu.triage',
    enMenu: true,
  },
  {
    path: '/asignacion',
    roles: ['coordinador', 'supervisor'],
    etiqueta: 'comun:menu.asignacion',
    enMenu: true,
  },
  {
    path: '/traslados',
    roles: ['supervisor'],
    etiqueta: 'comun:menu.traslados',
    enMenu: true,
  },
  {
    path: '/reportes',
    roles: ['tecnico', 'coordinador', 'supervisor', 'administrador'],
    etiqueta: 'comun:menu.reportes',
    enMenu: true,
  },
  {
    path: '/admin',
    roles: ['administrador'],
    etiqueta: 'comun:menu.admin',
    enMenu: true,
  },
]
