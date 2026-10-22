import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Rol } from './roles'
import { useSession } from './session'

interface RequireRoleProps {
  roles: readonly Rol[]
  children: ReactNode
}

// Solo evita mostrar pantallas inútiles: la autorización real está en el backend (RF-05).
export function RequireRole({ roles, children }: RequireRoleProps) {
  const session = useSession()
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (!roles.includes(session.rol)) {
    return <Navigate to="/403" replace />
  }
  return children
}
