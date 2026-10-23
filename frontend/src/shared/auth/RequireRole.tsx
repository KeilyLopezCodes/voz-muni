import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import type { Rol } from './roles'
import { useSesionCargando, useSession } from './session'

interface RequireRoleProps {
  roles: readonly Rol[]
  children: ReactNode
}

// Lo que /login recibe en location.state para volver a la página que se intentó abrir.
export interface EstadoLogin {
  desde: string
}

// Solo evita mostrar pantallas inútiles: la autorización real está en el backend (RF-05).
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { t } = useTranslation('comun')
  const session = useSession()
  const cargando = useSesionCargando()
  const location = useLocation()

  // Al recargar, la sesión todavía se está recuperando: redirigir aquí mandaría a /login a quien sí la tiene.
  if (cargando) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label={t('sesion.cargando')} />
      </Box>
    )
  }
  if (!session) {
    const estado: EstadoLogin = { desde: `${location.pathname}${location.search}` }
    return <Navigate to="/login" replace state={estado} />
  }
  if (!roles.includes(session.rol)) {
    return <Navigate to="/403" replace />
  }
  return children
}
