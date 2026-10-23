import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VerificarPage } from '../../src/features/auth/pages/VerificarPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()

function respuesta(status: number, cuerpo: object) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

// StrictMode monta los efectos dos veces: así se comprueba que la API se llama una sola vez.
function renderVerificar(ruta: string) {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[ruta]}>
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

    renderVerificar('/verificar?token=abc_123-XYZ')

    expect(screen.getByText(auth.verificar.verificando)).toBeInTheDocument()
    expect(await screen.findByText(auth.verificar.exito)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: auth.verificar.irALogin })).toHaveAttribute('href', '/login')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/verificar')
    expect(opciones?.method).toBe('POST')
    expect(JSON.parse(opciones?.body as string)).toEqual({ token: 'abc_123-XYZ' })
  })

  it('con 400 muestra "Enlace inválido o vencido" con un enlace a /registro', async () => {
    fetchMock.mockResolvedValue(respuesta(400, { codigo: 'TOKEN_VERIFICACION_INVALIDO', mensaje: 'x' }))

    renderVerificar('/verificar?token=usado')

    expect(await screen.findByText(auth.verificar.error)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: auth.verificar.irARegistro })).toHaveAttribute('href', '/registro')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sin token muestra el error y no llama a la API', () => {
    renderVerificar('/verificar')

    expect(screen.getByText(auth.verificar.error)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
