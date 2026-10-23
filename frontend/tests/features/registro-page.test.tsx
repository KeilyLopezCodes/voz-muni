import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistroPage } from '../../src/features/auth/pages/RegistroPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const { campos, errores } = auth.registro

function respuesta(status: number, cuerpo: object) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderRegistro() {
  render(
    <MemoryRouter>
      <RegistroPage />
    </MemoryRouter>,
  )
}

function llenar(cambios: Partial<Record<keyof typeof campos, string>> = {}) {
  const valores = {
    nombre: 'Ana López',
    dpi: '2547 12345 0101',
    email: 'ana@correo.gt',
    telefono: '',
    password: 'Clave-vecino-1',
    confirmacion: 'Clave-vecino-1',
    ...cambios,
  }
  for (const [campo, valor] of Object.entries(valores)) {
    const input = screen.getByLabelText(campos[campo as keyof typeof campos])
    fireEvent.change(input, { target: { value: valor } })
  }
}

const enviar = () => fireEvent.click(screen.getByRole('button', { name: auth.registro.enviar }))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RegistroPage', () => {
  it('enviar el formulario vacío muestra el mensaje traducido de cada campo obligatorio, sin llamar a la API', async () => {
    renderRegistro()

    enviar()

    expect(await screen.findByText(errores.nombre)).toBeInTheDocument()
    expect(screen.getByText(errores.dpi)).toBeInTheDocument()
    expect(screen.getByText(errores.email)).toBeInTheDocument()
    expect(screen.getByText(errores.passwordCorta)).toBeInTheDocument()
    expect(screen.queryByText(errores.telefono)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['dpi', '254712345010', errores.dpi],
    ['email', 'sin-arroba', errores.email],
    ['telefono', '5555000', errores.telefono],
    ['password', 'abcdefgh', errores.passwordSinNumero],
    ['password', '12345678', errores.passwordSinLetra],
  ] as const)('el campo %s con "%s" muestra su mensaje', async (campo, valor, mensaje) => {
    renderRegistro()

    llenar({ [campo]: valor, ...(campo === 'password' ? { confirmacion: valor } : {}) })
    enviar()

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una confirmación distinta bloquea el envío', async () => {
    renderRegistro()

    llenar({ confirmacion: 'Otra-clave-2' })
    enviar()

    expect(await screen.findByText(errores.confirmacion)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un envío válido llama a POST /api/v1/auth/registro y muestra "Revisa tu correo"', async () => {
    fetchMock.mockResolvedValue(respuesta(202, { mensaje: 'Revisa tu correo para continuar.' }))
    renderRegistro()

    llenar({ telefono: '5555-0000' })
    enviar()

    expect(await screen.findByText(auth.registro.enviado.titulo)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/registro')
    expect(opciones?.method).toBe('POST')
    expect(JSON.parse(opciones?.body as string)).toEqual({
      nombre: 'Ana López',
      dpi: '2547 12345 0101',
      email: 'ana@correo.gt',
      telefono: '5555-0000',
      password: 'Clave-vecino-1',
    })
  })

  it('sin teléfono no lo envía', async () => {
    fetchMock.mockResolvedValue(respuesta(202, { mensaje: 'Revisa tu correo para continuar.' }))
    renderRegistro()

    llenar()
    enviar()

    await screen.findByText(auth.registro.enviado.titulo)
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty('telefono')
  })

  it('un 400 DPI_INVALIDO del servidor se muestra en el campo DPI', async () => {
    fetchMock.mockResolvedValue(respuesta(400, { codigo: 'DPI_INVALIDO', mensaje: 'El DPI debe tener 13 dígitos' }))
    renderRegistro()

    llenar()
    enviar()

    const dpi = screen.getByLabelText(campos.dpi)
    expect(await screen.findByText(errores.dpi)).toBeInTheDocument()
    expect(dpi).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(auth.registro.enviado.titulo)).not.toBeInTheDocument()
  })

  it('un error sin campo, como la red caída, muestra el aviso general', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    renderRegistro()

    llenar()
    enviar()

    expect(await screen.findByText(errores.general)).toBeInTheDocument()
  })
})
