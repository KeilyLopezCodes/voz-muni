import type { ReactNode } from 'react'
import { CerrarSesionContext, SesionCargandoContext, SessionContext, type Session } from './session'

interface SessionProviderProps {
  session: Session | null
  // Mientras es true, RequireRole espera en lugar de mandar a /login.
  cargando?: boolean
  cerrarSesion?: () => Promise<void>
  children: ReactNode
}

const sinCierre = async () => {}

// AuthProvider (SPEC 17) le entrega la sesión real; las pruebas pueden pasarla fija.
export function SessionProvider({ session, cargando = false, cerrarSesion = sinCierre, children }: SessionProviderProps) {
  return (
    <SessionContext.Provider value={session}>
      <SesionCargandoContext.Provider value={cargando}>
        <CerrarSesionContext.Provider value={cerrarSesion}>{children}</CerrarSesionContext.Provider>
      </SesionCargandoContext.Provider>
    </SessionContext.Provider>
  )
}
