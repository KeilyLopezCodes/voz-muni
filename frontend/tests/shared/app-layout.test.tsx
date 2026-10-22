import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import comun from '../../src/locales/es/comun.json'
import { ROLES, type Rol } from '../../src/shared/auth/roles'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import '../../src/shared/i18n/i18n'
import { AppLayout } from '../../src/shared/layout/AppLayout'

// Rutas con enMenu = true de la tabla de SPEC 06, por rol.
const MENU_ESPERADO: Record<Rol, string[]> = {
  vecino: ['/tickets', '/tickets/nueva'],
  receptor: ['/tickets', '/tickets/nueva'],
  tecnico: ['/tickets', '/reportes'],
  coordinador: ['/tickets', '/reportes'],
  supervisor: ['/tickets', '/tickets/nueva', '/reportes'],
  administrador: ['/tickets', '/reportes', '/admin'],
}

describe('AppLayout', () => {
  it.each(ROLES)('el menú del rol %s muestra exactamente sus rutas', (rol) => {
    render(
      <SessionProvider session={{ usuarioId: 1, rol, dependenciaId: null }}>
        <MemoryRouter>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
    )

    // El menú permanente está oculto con CSS en pantallas chicas, pero existe en el DOM.
    const menu = screen.getByRole('navigation', { name: comun.menu.principal, hidden: true })
    const enlaces = within(menu).getAllByRole('link', { hidden: true })
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(MENU_ESPERADO[rol])
  })
})
