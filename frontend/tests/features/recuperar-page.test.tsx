import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecuperarPage } from '../../src/features/auth/pages/RecuperarPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const MENSAJE = { mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' }

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function enviar(email: string) {
  fireEvent.change(screen.getByLabelText(auth.login.campos.email, { exact: false }), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: auth.recuperar.enviar }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter>
      <RecuperarPage />
    </MemoryRouter>,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RecuperarPage', () => {
  it.each(['registrado@vozmuni.test', 'nadie@vozmuni.test'])(
    'con 202 muestra siempre el mismo mensaje (%s)',
    async (email) => {
      fetchMock.mockResolvedValue(json(202, MENSAJE))

      enviar(` ${email} `)

      expect(await screen.findByText(auth.recuperar.enviado)).toBeInTheDocument()
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/v1/auth/recuperar')
      expect(JSON.parse(init?.body as string)).toEqual({ email })
    },
  )

  it('el campo tiene autocomplete="email"', () => {
    expect(screen.getByLabelText(auth.login.campos.email, { exact: false })).toHaveAttribute('autocomplete', 'email')
  })

  it('un correo inválido se marca en el campo y no llama a la API', async () => {
    enviar('no-es-correo')

    expect(await screen.findByText(auth.login.validacion.EMAIL_INVALIDO)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['DEMASIADAS_PETICIONES', async () => json(429, { codigo: 'DEMASIADAS_PETICIONES' }), auth.login.errores.DEMASIADAS_PETICIONES],
    [
      'RED_NO_DISPONIBLE',
      async () => {
        throw new TypeError('Failed to fetch')
      },
      auth.login.errores.RED_NO_DISPONIBLE,
    ],
    ['otro código', async () => json(500, {}), auth.login.errores.GENERICO],
  ])('%s muestra su mensaje en un role="alert"', async (_codigo, respuesta, mensaje) => {
    fetchMock.mockImplementation(respuesta)

    enviar('ana@vozmuni.test')

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    expect(screen.queryByText(auth.recuperar.enviado)).not.toBeInTheDocument()
  })
})
