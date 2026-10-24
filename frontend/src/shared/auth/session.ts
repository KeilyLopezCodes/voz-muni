import { createContext, useContext } from 'react'
import type { Rol } from './roles'

export interface Session {
  usuarioId: number
  nombre: string // SPEC 44: para el menú de usuario
  rol: Rol
  dependenciaId: number | null
}

export const SessionContext = createContext<Session | null>(null)

// true mientras se recupera la sesión guardada al cargar la app (SPEC 17).
export const SesionCargandoContext = createContext(false)

// Lo entrega AuthProvider (features/auth); shared/ no conoce la feature.
export const CerrarSesionContext = createContext<() => Promise<void>>(async () => {})

export function useSession(): Session | null {
  return useContext(SessionContext)
}

export function useSesionCargando(): boolean {
  return useContext(SesionCargandoContext)
}

export function useCerrarSesion(): () => Promise<void> {
  return useContext(CerrarSesionContext)
}
