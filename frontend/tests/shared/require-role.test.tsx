import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RequireRole } from '../../src/shared/auth/RequireRole'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import type { Session } from '../../src/shared/auth/session'

function renderPrivada(session: Session | null) {
  render(
    <SessionProvider session={session}>
      <MemoryRouter initialEntries={['/privada']}>
        <Routes>
          <Route path="/login" element={<p>pantalla-login</p>} />
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
    expect(screen.getByText('pantalla-login')).toBeInTheDocument()
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
})
