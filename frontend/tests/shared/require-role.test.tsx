import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RequireRole } from '../../src/shared/auth/RequireRole'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import type { Session } from '../../src/shared/auth/session'
import comun from '../../src/locales/es/comun.json'
import '../../src/shared/i18n/i18n'

function Login() {
  const location = useLocation()
  return <p>pantalla-login {(location.state as { desde?: string } | null)?.desde}</p>
}

function renderPrivada(session: Session | null, cargando = false, inicio = '/privada') {
  render(
    <SessionProvider session={session} cargando={cargando}>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/403" element={<p>pantalla-403</p>} />
          <Route
            path="/privada"
            element={
              <RequireRole roles={['coordinador', 'supervisor']}>
                <p>contenido-privado</p>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('RequireRole', () => {
  it('redirige a /login sin sesión', () => {
    renderPrivada(null)
    expect(screen.getByText(/pantalla-login/)).toBeInTheDocument()
    expect(screen.queryByText('contenido-privado')).not.toBeInTheDocument()
  })

  it('redirige a /403 con un rol no permitido', () => {
    renderPrivada({ usuarioId: 1, rol: 'vecino', dependenciaId: null })
    expect(screen.getByText('pantalla-403')).toBeInTheDocument()
    expect(screen.queryByText('contenido-privado')).not.toBeInTheDocument()
  })

  it('muestra el contenido con un rol permitido', () => {
    renderPrivada({ usuarioId: 2, rol: 'coordinador', dependenciaId: 3 })
    expect(screen.getByText('contenido-privado')).toBeInTheDocument()
  })

  it('pasa la ruta original, con su query, en state.desde', () => {
    renderPrivada(null, false, '/privada?pagina=2')
    expect(screen.getByText('pantalla-login /privada?pagina=2')).toBeInTheDocument()
  })

  it('mientras la sesión carga muestra un indicador y no redirige', () => {
    renderPrivada(null, true)
    expect(screen.getByRole('progressbar', { name: comun.sesion.cargando })).toBeInTheDocument()
    expect(screen.queryByText(/pantalla-login/)).not.toBeInTheDocument()
    expect(screen.queryByText('contenido-privado')).not.toBeInTheDocument()
  })
})
