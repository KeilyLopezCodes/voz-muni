import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistroPage } from '../../src/features/auth/pages/RegistroPage'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const { campos, errores } = auth.registro

const VALIDOS = {
  nombre: 'María López',
  dpi: '2547 12345 0101',
  email: 'maria@correo.gt',
  telefono: '',
  password: 'Clave2026',
  confirmacion: 'Clave2026',
}

function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function llenar(valores: Partial<typeof VALIDOS> = {}) {
  const datos = { ...VALIDOS, ...valores }
  fireEvent.change(screen.getByLabelText(campos.nombre, { exact: false }), { target: { value: datos.nombre } })
  fireEvent.change(screen.getByLabelText(campos.dpi, { exact: false }), { target: { value: datos.dpi } })
  fireEvent.change(screen.getByLabelText(campos.email, { exact: false }), { target: { value: datos.email } })
  fireEvent.change(screen.getByLabelText(campos.telefono, { exact: false }), { target: { value: datos.telefono } })
  fireEvent.change(screen.getByLabelText(campos.password, { exact: false, selector: 'input[name="password"]' }), {
    target: { value: datos.password },
  })
  fireEvent.change(screen.getByLabelText(campos.confirmacion, { exact: false }), {
    target: { value: datos.confirmacion },
  })
}

const enviar = () => fireEvent.click(screen.getByRole('button', { name: auth.registro.enviar }))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  render(<RegistroPage />)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RegistroPage', () => {
  it.each([
    ['nombre vacío', { nombre: '   ' }, errores.NOMBRE_INVALIDO],
    ['DPI de 12 dígitos', { dpi: '254712345010' }, errores.DPI_INVALIDO],
    ['correo inválido', { email: 'no-es-correo' }, errores.EMAIL_INVALIDO],
    ['teléfono de 7 dígitos', { telefono: '5555000' }, errores.TELEFONO_INVALIDO],
    ['contraseña corta', { password: 'Abc1234', confirmacion: 'Abc1234' }, errores.MUY_CORTA],
    ['contraseña sin letra', { password: '12345678', confirmacion: '12345678' }, errores.SIN_LETRA],
    ['contraseña sin número', { password: 'abcdefgh', confirmacion: 'abcdefgh' }, errores.SIN_NUMERO],
  ])('%s muestra su mensaje traducido y no llama a la API', async (_caso, valores, mensaje) => {
    llenar(valores)
    enviar()

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una confirmación distinta bloquea el envío', async () => {
    llenar({ confirmacion: 'Otra2026' })
    enviar()

    expect(await screen.findByText(errores.CONFIRMACION_DISTINTA)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un envío válido llama a POST /api/v1/auth/registro y muestra "Revisa tu correo"', async () => {
    fetchMock.mockResolvedValue(respuesta(202, { mensaje: 'Revisa tu correo para continuar.' }))
    llenar({ email: ' maria@correo.gt ', telefono: '5555-0000' })
    enviar()

    expect(await screen.findByText(auth.registro.exito.titulo)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/registro')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      nombre: 'María López',
      dpi: '2547 12345 0101',
      email: 'maria@correo.gt',
      telefono: '5555-0000',
      password: 'Clave2026',
    })
    // La confirmación no viaja y el formulario desaparece.
    expect(screen.queryByRole('button', { name: auth.registro.enviar })).not.toBeInTheDocument()
  })

  it('sin teléfono no envía el campo', async () => {
    fetchMock.mockResolvedValue(respuesta(202, { mensaje: 'Revisa tu correo para continuar.' }))
    llenar()
    enviar()

    await screen.findByText(auth.registro.exito.titulo)
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty('telefono')
  })

  it('un 400 DPI_INVALIDO del servidor se muestra en el campo DPI', async () => {
    fetchMock.mockResolvedValue(respuesta(400, { codigo: 'DPI_INVALIDO', mensaje: 'El DPI debe tener 13 dígitos' }))
    llenar()
    enviar()

    const dpi = screen.getByLabelText(campos.dpi, { exact: false })
    await waitFor(() => expect(dpi).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(errores.DPI_INVALIDO)).toBeInTheDocument()
    expect(screen.queryByText(auth.registro.exito.titulo)).not.toBeInTheDocument()
  })

  it('sin conexión muestra el error de red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    llenar()
    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(errores.RED_NO_DISPONIBLE)
  })
})
