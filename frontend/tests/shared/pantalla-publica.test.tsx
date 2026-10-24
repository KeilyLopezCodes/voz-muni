import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import comun from '../../src/locales/es/comun.json'
import '../../src/shared/i18n/i18n'
import { PantallaPublica } from '../../src/shared/layout/PantallaPublica'
import { CLAVE_MODO, theme } from '../../src/shared/theme/theme'

const { marca, tema } = comun

const conTema = (hijos: ReactNode) => (
  <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={CLAVE_MODO}>
    {hijos}
  </ThemeProvider>
)

function renderPantalla(envolver: (hijos: ReactNode) => ReactNode = conTema) {
  render(
    envolver(
      <PantallaPublica titulo="Iniciar sesión">
        <p>contenido-de-la-pagina</p>
      </PantallaPublica>,
    ),
  )
}

describe('PantallaPublica', () => {
  it('tiene un solo h1 ("VozMuni") y un h2 con el título', () => {
    renderPantalla()

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([comun.app.titulo])
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Iniciar sesión')
  })

  it('el panel de marca muestra el logo, el lema y los 3 beneficios', () => {
    renderPantalla()

    const panel = screen.getByRole('complementary')
    expect(within(panel).getByRole('img', { name: marca.logo })).toBeInTheDocument()
    expect(within(panel).getByText(marca.lema)).toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      marca.beneficios.registra,
      marca.beneficios.sigue,
      marca.beneficios.respuesta,
    ])
  })

  it('incluye el selector de tema y renderiza el contenido dentro de main', () => {
    renderPantalla()

    expect(screen.getByRole('button', { name: tema.etiqueta })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('contenido-de-la-pagina')).toBeInTheDocument()
  })

  it('funciona sin ThemeProvider, como la montan las pruebas de las páginas', () => {
    renderPantalla((hijos) => hijos)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(comun.app.titulo)
    expect(screen.getByText('contenido-de-la-pagina')).toBeInTheDocument()
  })
})
