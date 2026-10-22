import { createContext, useContext } from 'react'
import type { Rol } from './roles'

export interface Session {
  usuarioId: number
  rol: Rol
  dependenciaId: number | null
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session | null {
  return useContext(SessionContext)
}
