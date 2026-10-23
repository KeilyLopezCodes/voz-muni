import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { RestablecerPage } from '../../src/features/auth/pages/RestablecerPage'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const { restablecer, registro } = auth

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function sesion(rol: string) {
  return {
    accessToken: 'acceso-1',
    accessExpiraEn: '2026-10-23T15:15:00.000Z',
    refreshToken: 'r1',
    refreshExpiraEn: '2026-10-30T15:00:00.000Z',
    usuario: { id: 9, nombre: 'Usuario', rol, dependenciaId: rol === 'tecnico' ? 4 : null },
  }
}

function renderRestablecer(url: string) {
  const queryClient = new QueryClient()
  const router = createMemoryRouter(
    [
      { path: '/restablecer', element: <RestablecerPage /> },
      { path: '/tickets', element: <p>pantalla-tickets</p> },
      { path: '/admin', element: <p>pantalla-admin</p> },
      { path: '/recuperar', element: <p>pantalla-recuperar</p> },
    ],
    { initialEntries: [url] },
  )
  render(
    <AuthProvider queryClient={queryClient} irALogin={() => void router.navigate('/login')}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

function llenar(password: string, confirmacion = password) {
  fireEvent.change(screen.getByLabelText(restablecer.campos.password, { exact: false }), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(restablecer.campos.confirmacion, { exact: false }), {
    target: { value: confirmacion },
  })
  fireEvent.click(screen.getByRole('button', { name: restablecer.enviar }))
}

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RestablecerPage', () => {
  it('los campos tienen autocomplete="new-password"', () => {
    renderRestablecer('/restablecer?token=abc')

    expect(screen.getByLabelText(restablecer.campos.password, { exact: false })).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
    expect(screen.getByLabelText(restablecer.campos.confirmacion, { exact: false })).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
  })

  it.each([
    ['Abc1234', registro.errores.MUY_CORTA],
    ['12345678', registro.errores.SIN_LETRA],
    ['abcdefgh', registro.errores.SIN_NUMERO],
  ])('valida la política RNF-08 en el cliente (%s) sin llamar a la API', async (password, mensaje) => {
    renderRestablecer('/restablecer?token=abc')

    llenar(password)

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    expect(screen.getByLabelText(restablecer.campos.password, { exact: false })).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una confirmación distinta bloquea el envío', async () => {
    renderRestablecer('/restablecer?token=abc')

    llenar('Clave2026', 'Otra2026')

    expect(await screen.findByText(registro.errores.CONFIRMACION_DISTINTA)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['recuperación de un vecino', 'vecino', 'pantalla-tickets'],
    ['invitación de un técnico', 'tecnico', 'pantalla-tickets'],
    ['invitación de un administrador', 'administrador', 'pantalla-admin'],
  ])('con 200 (%s) inicia sesión y va al inicio del rol', async (_caso, rol, pantalla) => {
    fetchMock.mockResolvedValue(json(200, sesion(rol)))
    renderRestablecer('/restablecer?token=abc123')

    llenar('Clave2026')

    expect(await screen.findByText(pantalla)).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('r1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/restablecer')
    expect(JSON.parse(init?.body as string)).toEqual({ token: 'abc123', password: 'Clave2026' })
  })

  it('TOKEN_RECUPERACION_INVALIDO muestra el error con un enlace a /recuperar', async () => {
    fetchMock.mockResolvedValue(json(400, { codigo: 'TOKEN_RECUPERACION_INVALIDO', mensaje: 'x' }))
    renderRestablecer('/restablecer?token=vencido')

    llenar('Clave2026')

    expect(await screen.findByRole('alert')).toHaveTextContent(restablecer.errores.TOKEN_RECUPERACION_INVALIDO)
    expect(screen.getByRole('link', { name: restablecer.pedirOtro })).toHaveAttribute('href', '/recuperar')
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('un 400 POLITICA_PASSWORD del servidor se muestra en el campo', async () => {
    fetchMock.mockResolvedValue(json(400, { codigo: 'POLITICA_PASSWORD', mensaje: 'MUY_CORTA' }))
    renderRestablecer('/restablecer?token=abc')

    llenar('Clave2026')

    expect(await screen.findByText(restablecer.errores.POLITICA_PASSWORD)).toBeInTheDocument()
    expect(screen.getByLabelText(restablecer.campos.password, { exact: false })).toHaveAttribute('aria-invalid', 'true')
  })

  it('sin red muestra el error de conexión', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    renderRestablecer('/restablecer?token=abc')

    llenar('Clave2026')

    expect(await screen.findByRole('alert')).toHaveTextContent(restablecer.errores.RED_NO_DISPONIBLE)
  })

  it('sin token muestra el error y el enlace a /recuperar sin llamar a la API', () => {
    renderRestablecer('/restablecer')

    expect(screen.getByRole('alert')).toHaveTextContent(restablecer.errores.TOKEN_RECUPERACION_INVALIDO)
    expect(screen.getByRole('link', { name: restablecer.pedirOtro })).toHaveAttribute('href', '/recuperar')
    expect(screen.queryByRole('button', { name: restablecer.enviar })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
