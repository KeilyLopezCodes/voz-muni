import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VerificarPage } from '../../src/features/auth/pages/VerificarPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const { verificar } = auth

function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

// StrictMode monta dos veces, como en desarrollo: la página debe llamar a la API una sola vez.
function renderVerificar(url: string) {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <VerificarPage />
      </MemoryRouter>
    </StrictMode>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VerificarPage', () => {
  it('con un token válido llama una sola vez a la API y muestra "Correo verificado" con un enlace a /login', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { mensaje: 'Correo verificado. Ya puedes iniciar sesión.' }))

    renderVerificar('/verificar?token=abc123')

    expect(screen.getByText(verificar.verificando)).toBeInTheDocument()
    expect(await screen.findByText(verificar.exito.titulo)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: verificar.irALogin })).toHaveAttribute('href', '/login')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/verificar')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ token: 'abc123' })
  })

  it('con 400 muestra "Enlace inválido o vencido" con un enlace a /registro', async () => {
    fetchMock.mockResolvedValue(respuesta(400, { codigo: 'TOKEN_VERIFICACION_INVALIDO', mensaje: 'x' }))

    renderVerificar('/verificar?token=usado')

    expect(await screen.findByText(verificar.invalido.titulo)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: verificar.irARegistro })).toHaveAttribute('href', '/registro')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sin token muestra el error sin llamar a la API', () => {
    renderVerificar('/verificar')

    expect(screen.getByText(verificar.invalido.titulo)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin conexión no dice que el enlace venció', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    renderVerificar('/verificar?token=abc123')

    expect(await screen.findByText(verificar.sinConexion)).toBeInTheDocument()
    expect(screen.queryByText(verificar.invalido.titulo)).not.toBeInTheDocument()
  })
})
