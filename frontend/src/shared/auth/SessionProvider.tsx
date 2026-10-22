import type { ReactNode } from 'react'
import { SessionContext, type Session } from './session'

interface SessionProviderProps {
  session: Session | null
  children: ReactNode
}

// La spec de autenticación solo cambia de dónde llega `session`; las guardas no cambian.
export function SessionProvider({ session, children }: SessionProviderProps) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
