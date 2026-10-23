import type { QueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { setTokenProvider, setUnauthorizedHandler } from '../../shared/api/http-client'
import { ROLES, type Rol } from '../../shared/auth/roles'
import type { Session } from '../../shared/auth/session'
import { SessionProvider } from '../../shared/auth/SessionProvider'
import { logout, type RespuestaSesion } from './api/auth-api'
import { borrarRefresh, CLAVE_REFRESH, guardarRefresh, leerRefresh } from './sesion/almacen-sesion'
import { renovar } from './sesion/renovador'

// El token de acceso vive solo aquí, en memoria: nunca en localStorage, sessionStorage ni cookies.
let tokenAcceso: string | null = null

// Guarda los tokens y fija la sesión. Devuelve false si el rol recibido no es uno de ROLES.
type IniciarSesion = (respuesta: RespuestaSesion) => boolean

const IniciarSesionContext = createContext<IniciarSesion>(() => false)

// La usan /login y /restablecer.
export function useIniciarSesion(): IniciarSesion {
  return useContext(IniciarSesionContext)
}

const esRol = (rol: string): rol is Rol => (ROLES as readonly string[]).includes(rol)

interface AuthProviderProps {
  queryClient: QueryClient
  // La navegación vive en app/: AuthProvider solo pide ir a /login.
  irALogin: () => void
  children: ReactNode
}

// Sesión real del navegador (SPEC 17). Entrega la sesión a SessionProvider de shared/.
export function AuthProvider({ queryClient, irALogin, children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  // Solo hay algo que recuperar si quedó un token de renovación guardado.
  const [cargando, setCargando] = useState(() => leerRefresh() !== null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  // Aplica una respuesta de login, refresh o restablecer. Un rol desconocido no crea sesión.
  const aplicar = useCallback((respuesta: RespuestaSesion): boolean => {
    const { id, rol, dependenciaId } = respuesta.usuario
    if (!esRol(rol)) {
      tokenAcceso = null
      borrarRefresh()
      setSession(null)
      return false
    }
    tokenAcceso = respuesta.accessToken
    setSession((actual) =>
      actual && actual.usuarioId === id && actual.rol === rol && actual.dependenciaId === dependenciaId
        ? actual
        : { usuarioId: id, rol, dependenciaId },
    )
    return true
  }, [])

  const limpiarLocal = useCallback(() => {
    tokenAcceso = null
    borrarRefresh()
    setSession(null)
    queryClient.clear()
  }, [queryClient])

  const iniciarSesion = useCallback<IniciarSesion>(
    (respuesta) => {
      guardarRefresh(respuesta.refreshToken)
      return aplicar(respuesta)
    },
    [aplicar],
  )

  // Limpia siempre, aunque /auth/logout falle por la red: la sesión nunca queda "pegada".
  const cerrarSesion = useCallback(async () => {
    const token = leerRefresh()
    limpiarLocal()
    if (token) {
      logout(token).catch(() => {
        // El backend la revocará al vencer; localmente ya no existe.
      })
    }
    irALogin()
  }, [limpiarLocal, irALogin])

  // El cliente HTTP pide el token en cada petición y, ante un 401, una renovación.
  useEffect(() => {
    setTokenProvider(() => tokenAcceso)
    setUnauthorizedHandler(async () => {
      try {
        const respuesta = await renovar()
        if (respuesta && aplicar(respuesta)) {
          return true
        }
        limpiarLocal()
        return false
      } catch {
        // Sin red no se cierra la sesión: la petición falla con su 401 original.
        return false
      }
    })
    return () => {
      setTokenProvider(() => null)
      setUnauthorizedHandler(async () => false)
    }
  }, [aplicar, limpiarLocal])

  // Al cargar la app recupera la sesión con el token guardado.
  useEffect(() => {
    if (leerRefresh() === null) {
      return
    }
    let vigente = true
    renovar()
      .then((respuesta) => {
        if (vigente && respuesta) {
          aplicar(respuesta)
        }
      })
      .catch(() => {
        // Sin red al cargar: no hay sesión todavía, pero el token se conserva para el próximo intento.
      })
      .finally(() => {
        if (vigente) {
          setCargando(false)
        }
      })
    return () => {
      vigente = false
    }
  }, [aplicar])

  // Otra pestaña cerró o inició sesión (el evento storage no llega a la pestaña que escribió).
  useEffect(() => {
    function alCambiarAlmacen(evento: StorageEvent) {
      if (evento.key !== CLAVE_REFRESH && evento.key !== null) {
        return
      }
      if (evento.newValue === null) {
        if (sessionRef.current) {
          tokenAcceso = null
          setSession(null)
          queryClient.clear()
          irALogin()
        }
        return
      }
      if (!sessionRef.current) {
        renovar()
          .then((respuesta) => {
            if (respuesta) {
              aplicar(respuesta)
            }
          })
          .catch(() => {})
      }
    }
    window.addEventListener('storage', alCambiarAlmacen)
    return () => window.removeEventListener('storage', alCambiarAlmacen)
  }, [aplicar, queryClient, irALogin])

  return (
    <IniciarSesionContext.Provider value={iniciarSesion}>
      <SessionProvider session={session} cargando={cargando} cerrarSesion={cerrarSesion}>
        {children}
      </SessionProvider>
    </IniciarSesionContext.Provider>
  )
}
