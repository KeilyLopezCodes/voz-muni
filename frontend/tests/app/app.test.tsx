import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/app/App'
import auth from '../../src/locales/es/auth.json'
import comun from '../../src/locales/es/comun.json'

// /login consulta /health; la prueba no debe llegar a un backend real.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Sin SessionProvider la sesión es null, así que / termina en /login.
describe('App', () => {
  it('se monta y, sin sesión, muestra la página de login', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(auth.login.titulo)
  })

  it('muestra el título de la app desde comun.json', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(comun.app.titulo)
  })
})
