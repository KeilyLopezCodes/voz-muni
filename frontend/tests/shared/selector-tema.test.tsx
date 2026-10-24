import Menu from '@mui/material/Menu'
import { ThemeProvider } from '@mui/material/styles'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import comun from '../../src/locales/es/comun.json'
import '../../src/shared/i18n/i18n'
import { SelectorTema } from '../../src/shared/theme/SelectorTema'
import { CLAVE_MODO, theme } from '../../src/shared/theme/theme'

const { tema } = comun

// Igual que App.tsx: el modo se guarda en localStorage[CLAVE_MODO] y por defecto sigue al sistema.
function renderSelector(variante: 'opciones' | 'boton') {
  render(
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={CLAVE_MODO}>
      {variante === 'opciones' ? (
        <Menu open anchorEl={document.body}>
          <SelectorTema variante="opciones" />
        </Menu>
      ) : (
        <SelectorTema variante="boton" />
      )}
    </ThemeProvider>,
  )
}

const opcion = (nombre: string) => screen.getByRole('menuitemradio', { name: nombre })

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SelectorTema', () => {
  it('muestra las 3 opciones traducidas bajo el título "Tema"', () => {
    renderSelector('opciones')

    expect(screen.getByText(tema.etiqueta)).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      tema.claro,
      tema.oscuro,
      tema.sistema,
    ])
  })

  it('sin nada guardado, la opción marcada es "Sistema"', async () => {
    renderSelector('opciones')

    await waitFor(() => expect(opcion(tema.sistema)).toHaveAttribute('aria-checked', 'true'))
    expect(opcion(tema.claro)).toHaveAttribute('aria-checked', 'false')
    expect(opcion(tema.oscuro)).toHaveAttribute('aria-checked', 'false')
  })

  it('elegir "Oscuro" guarda dark en localStorage["vozmuni.tema"] y aplica la clase .dark', async () => {
    renderSelector('opciones')

    fireEvent.click(opcion(tema.oscuro))

    await waitFor(() => expect(localStorage.getItem('vozmuni.tema')).toBe('dark'))
    expect(opcion(tema.oscuro)).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })

  it('respeta la elección guardada', async () => {
    localStorage.setItem('vozmuni.tema', 'light')

    renderSelector('opciones')

    await waitFor(() => expect(opcion(tema.claro)).toHaveAttribute('aria-checked', 'true'))
  })

  it('un localStorage que lanza no rompe el selector', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })

    renderSelector('opciones')
    await waitFor(() => expect(opcion(tema.sistema)).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(opcion(tema.oscuro))

    await waitFor(() => expect(opcion(tema.oscuro)).toHaveAttribute('aria-checked', 'true'))
  })

  it('la variante botón abre el menú con las 3 opciones y lo cierra al elegir', async () => {
    renderSelector('boton')

    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: tema.etiqueta }))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)

    fireEvent.click(opcion(tema.claro))

    await waitFor(() => expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument())
    expect(localStorage.getItem('vozmuni.tema')).toBe('light')
  })
})
