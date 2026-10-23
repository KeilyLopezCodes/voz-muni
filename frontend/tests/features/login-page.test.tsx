import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../../src/features/auth/pages/LoginPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginPage', () => {
  it('muestra "Servidor disponible" cuando /health responde 200', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', database: 'up', timestamp: '2026-10-22T15:04:05.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.disponible)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/health')
  })

  it('muestra "Servidor no disponible" cuando /health responde 503', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'degraded', database: 'down', timestamp: '2026-10-22T15:04:05.000Z' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.noDisponible)).toBeInTheDocument()
  })

  it('muestra "Servidor no disponible" cuando el backend no responde', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.noDisponible)).toBeInTheDocument()
  })

  it('tiene el enlace "Crear cuenta" a /registro (SPEC 16)', () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    renderLogin()

    expect(screen.getByRole('link', { name: auth.login.crearCuenta })).toHaveAttribute('href', '/registro')
  })
})
