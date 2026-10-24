import { ThemeProvider } from '@mui/material/styles'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import comun from '../../src/locales/es/comun.json'
import type { Rol } from '../../src/shared/auth/roles'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import '../../src/shared/i18n/i18n'
import { iniciales, MenuUsuario } from '../../src/shared/layout/MenuUsuario'
import { CLAVE_MODO, theme } from '../../src/shared/theme/theme'

function renderMenu(nombre: string, rol: Rol, cerrarSesion = vi.fn(async () => {})) {
  const session = { usuarioId: 7, nombre, rol, dependenciaId: null }
  render(
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={CLAVE_MODO}>
      <SessionProvider session={session} cerrarSesion={cerrarSesion}>
        <MenuUsuario session={session} />
      </SessionProvider>
    </ThemeProvider>,
  )
  return cerrarSesion
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: comun.menuUsuario.abrir }))

beforeEach(() => {
  localStorage.clear()
})

describe('iniciales', () => {
  it.each([
    ['María López', 'ML'],
    ['ana', 'A'],
    ['  Óscar   Pérez García ', 'ÓP'],
    ['ñandú rojas', 'ÑR'],
    ['', '?'],
    ['   ', '?'],
  ])('%j → %s', (nombre, esperado) => {
    expect(iniciales(nombre)).toBe(esperado)
  })
})

describe('MenuUsuario', () => {
  it('el avatar muestra las iniciales y el menú empieza cerrado', () => {
    renderMenu('María López', 'vecino')

    expect(screen.getByRole('button', { name: comun.menuUsuario.abrir })).toHaveTextContent('ML')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it.each([
    ['vecino', comun.roles.vecino],
    ['tecnico', comun.roles.tecnico],
    ['administrador', comun.roles.administrador],
  ] as const)('al abrirse muestra el nombre y el rol traducido (%s)', (rol, rolTraducido) => {
    renderMenu('María López', rol)

    abrir()

    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent('María López')
    expect(menu).toHaveTextContent(rolTraducido)
  })

  it('incluye el selector de tema con sus 3 opciones', async () => {
    renderMenu('María López', 'vecino')

    abrir()

    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      comun.tema.claro,
      comun.tema.oscuro,
      comun.tema.sistema,
    ])
    fireEvent.click(screen.getByRole('menuitemradio', { name: comun.tema.oscuro }))
    await waitFor(() => expect(localStorage.getItem('vozmuni.tema')).toBe('dark'))
  })

  it('"Cerrar sesión" llama a cerrarSesion de la sesión y cierra el menú', async () => {
    const cerrarSesion = renderMenu('María López', 'vecino')

    abrir()
    fireEvent.click(screen.getByRole('menuitem', { name: comun.menu.cerrarSesion }))

    expect(cerrarSesion).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
