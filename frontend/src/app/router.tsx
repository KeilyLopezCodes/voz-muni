import type { ComponentType } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { AdminPage } from '../features/admin/pages/AdminPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RecuperarPage } from '../features/auth/pages/RecuperarPage'
import { RegistroPage } from '../features/auth/pages/RegistroPage'
import { RestablecerPage } from '../features/auth/pages/RestablecerPage'
import { VerificarPage } from '../features/auth/pages/VerificarPage'
import { ReportesPage } from '../features/reportes/pages/ReportesPage'
import { ConsultaPage } from '../features/tickets/pages/ConsultaPage'
import { NuevoTicketPage } from '../features/tickets/pages/NuevoTicketPage'
import { TicketsPage } from '../features/tickets/pages/TicketsPage'
import { TriagePage } from '../features/tickets/triage/TriagePage'
import { inicioPorRol } from '../shared/auth/inicio-por-rol'
import { RequireRole } from '../shared/auth/RequireRole'
import { ROLES } from '../shared/auth/roles'
import { RUTAS_PROTEGIDAS } from '../shared/auth/rutas'
import { useSession } from '../shared/auth/session'
import { AppLayout } from '../shared/layout/AppLayout'
import { NoAutorizadoPage } from '../shared/pages/NoAutorizadoPage'
import { NoEncontradoPage } from '../shared/pages/NoEncontradoPage'

// Página de cada ruta protegida. Los roles salen de RUTAS_PROTEGIDAS.
const PAGINAS: Record<string, ComponentType> = {
  '/tickets': TicketsPage,
  '/tickets/nueva': NuevoTicketPage,
  '/triage': TriagePage,
  '/reportes': ReportesPage,
  '/admin': AdminPage,
}

function RedirigirAlInicio() {
  const session = useSession()
  return session ? <Navigate to={inicioPorRol(session.rol)} replace /> : null
}

const rutasProtegidas: RouteObject[] = RUTAS_PROTEGIDAS.map((ruta) => {
  const Pagina = PAGINAS[ruta.path]
  if (!Pagina) {
    throw new Error(`Falta la página de la ruta ${ruta.path}`)
  }
  return {
    path: ruta.path,
    element: (
      <RequireRole roles={ruta.roles}>
        <AppLayout>
          <Pagina />
        </AppLayout>
      </RequireRole>
    ),
  }
})

export const rutasApp: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  { path: '/verificar', element: <VerificarPage /> },
  { path: '/recuperar', element: <RecuperarPage /> },
  { path: '/restablecer', element: <RestablecerPage /> },
  { path: '/consulta', element: <ConsultaPage /> },
  { path: '/403', element: <NoAutorizadoPage /> },
  {
    path: '/',
    element: (
      <RequireRole roles={ROLES}>
        <RedirigirAlInicio />
      </RequireRole>
    ),
  },
  ...rutasProtegidas,
  { path: '*', element: <NoEncontradoPage /> },
]
