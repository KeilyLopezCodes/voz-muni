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
    // Detalle de una queja (SPEC 25): se llega desde "Mis quejas" o desde un enlace, no desde el menú.
    path: '/tickets/:id',
    roles: ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'],
    etiqueta: 'comun:menu.tickets',
    enMenu: false,
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
    path: '/atencion',
    roles: ['tecnico', 'coordinador', 'supervisor'],
    etiqueta: 'comun:menu.atencion',
    enMenu: true,
  },
  {
    path: '/traslados',
    roles: ['supervisor'],
    etiqueta: 'comun:menu.traslados',
    enMenu: true,
  },
  {
    // Escalamientos (SPEC 32): quien tiene tickets.triage, hoy el supervisor.
    path: '/escaladas',
    roles: ['supervisor'],
    etiqueta: 'comun:menu.escaladas',
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
  {
    // Políticas de SLA (SPEC 29): se llega desde el índice de /admin.
    path: '/admin/sla',
    roles: ['administrador'],
    etiqueta: 'comun:menu.adminSla',
    enMenu: false,
  },
  // Catálogos de la organización (SPEC 40): se llega desde el índice de /admin.
  {
    path: '/admin/dependencias',
    roles: ['administrador'],
    etiqueta: 'comun:menu.adminDependencias',
    enMenu: false,
  },
  {
    path: '/admin/categorias',
    roles: ['administrador'],
    etiqueta: 'comun:menu.adminCategorias',
    enMenu: false,
  },
  {
    path: '/admin/zonas',
    roles: ['administrador'],
    etiqueta: 'comun:menu.adminZonas',
    enMenu: false,
  },
]
