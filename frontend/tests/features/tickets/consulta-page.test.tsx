import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConsultaPublica } from '../../../src/features/tickets/api/consulta-publica-api'
import { ConsultaPage } from '../../../src/features/tickets/pages/ConsultaPage'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { consulta: textos } = tickets
const NUMERO = 'Q-2026-000123'
const RUTA = `GET /public/tickets/${NUMERO}`

afterEach(() => {
  vi.unstubAllGlobals()
})

function consulta(cambios: Partial<ConsultaPublica> = {}): ConsultaPublica {
  return {
    numero: NUMERO,
    titulo: 'Bache frente a la escuela',
    estado: 'en_proceso',
    categoria: 'Baches',
    zona: 'Zona 1',
    creadoEn: '2026-10-20T15:00:00.000Z',
    resueltoEn: null,
    cerradoEn: null,
    cierreAutomatico: false,
    esperaRespuesta: false,
    solucion: null,
    confirmacion: null,
    lineaTiempo: [
      { ocurridoEn: '2026-10-22T15:00:00.000Z', actor: 'municipalidad', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null },
      { ocurridoEn: '2026-10-20T15:00:00.000Z', actor: 'vecino', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null },
    ],
    comentarios: [
      { cuerpo: 'Vamos el jueves', autor: 'municipalidad', creadoEn: '2026-10-22T16:00:00.000Z', editadoEn: null },
      { cuerpo: 'Gracias', autor: 'vecino', creadoEn: '2026-10-22T17:00:00.000Z', editadoEn: '2026-10-22T17:02:00.000Z' },
    ],
    ...cambios,
  }
}

function montar(ruta = `/consulta?numero=${NUMERO.toLowerCase()}`, rutas: Record<string, Manejador> = {}) {
  const fetchMock = simularApi(rutas)
  const router = createMemoryRouter(
    [
      { path: '/consulta', element: <ConsultaPage /> },
      { path: '/login', element: <p>pantalla-de-login</p> },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
  return { fetchMock, router }
}

const campoNumero = () => screen.getByRole('textbox', { name: new RegExp(textos.campos.numero) })
const campoContacto = () => screen.getByRole('textbox', { name: new RegExp(textos.campos.contacto) })

function consultar(contacto = 'ana@correo.gt') {
  fireEvent.change(campoContacto(), { target: { value: contacto } })
  fireEvent.click(screen.getByRole('button', { name: textos.consultar }))
}

describe('ConsultaPage', () => {
  it('?numero= precarga el número en mayúsculas', () => {
    montar()
    expect(campoNumero()).toHaveValue(NUMERO)
  })

  it('exige el formato del número y el contacto, sin llamar a la API', async () => {
    const { fetchMock } = montar('/consulta')
    fireEvent.change(campoNumero(), { target: { value: 'Q-26-1' } })
    fireEvent.click(screen.getByRole('button', { name: textos.consultar }))

    expect(await screen.findByText(textos.validacion.numero)).toBeInTheDocument()
    expect(screen.getByText(textos.validacion.contacto)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envía el contacto en la petición, nunca en la URL del navegador', async () => {
    const { fetchMock, router } = montar(undefined, { [RUTA]: () => respuesta(200, consulta()) })
    consultar(' 5555-0000 ')

    await screen.findByText('Bache frente a la escuela')
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.pathname).toBe(`/api/v1/public/tickets/${NUMERO}`)
    expect(url.searchParams.get('contacto')).toBe('5555-0000')
    expect(router.state.location.search).toBe(`?numero=${NUMERO.toLowerCase()}`)
    expect(`${router.state.location.pathname}${router.state.location.search}`).not.toContain('5555')
  })

  it('un 200 muestra el estado, el historial con los actores traducidos y los comentarios', async () => {
    montar(undefined, { [RUTA]: () => respuesta(200, consulta()) })
    consultar()

    expect(await screen.findByText('Bache frente a la escuela')).toBeInTheDocument()
    expect(screen.getByText(tickets.estados.en_proceso)).toBeInTheDocument()
    expect(screen.getByText('Zona 1')).toBeInTheDocument()
    const historial = screen.getByRole('region', { name: textos.historial })
    expect(within(historial).getByText(`Municipalidad: pasó a ${tickets.estados.en_proceso}`)).toBeInTheDocument()
    expect(within(historial).getByText('Vecino registró la queja')).toBeInTheDocument()
    const comentarios = screen.getByRole('region', { name: textos.comentarios })
    expect(within(comentarios).getByText('Vamos el jueves')).toBeInTheDocument()
    expect(within(comentarios).getByText(/Vecino ·.*editado/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /comentario/i })).not.toBeInTheDocument()
  })

  it('una solución con <b> se muestra como texto, con el plazo para confirmar', async () => {
    montar(undefined, {
      [RUTA]: () =>
        respuesta(
          200,
          consulta({
            estado: 'resuelta',
            solucion: { descripcion: 'Se rellenó <b>el bache</b>', resueltaEn: '2026-10-24T15:00:00.000Z' },
            confirmacion: { venceEn: '2026-10-31T05:59:59.999Z', vencida: false },
          }),
        ),
    })
    consultar()

    expect(await screen.findByText('Se rellenó <b>el bache</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
    expect(screen.getByText(/Tienes hasta el .* para confirmar la solución/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: textos.portal.confirmar })).toHaveAttribute('href', '/login')
  })

  it.each<[string, Partial<ConsultaPublica>, string]>([
    ['en espera', { estado: 'en_espera', esperaRespuesta: true }, textos.portal.responder],
    ['con el plazo vencido', { estado: 'resuelta', confirmacion: { venceEn: '2026-10-01T00:00:00.000Z', vencida: true } }, textos.portal.ver],
    ['en otro estado', {}, textos.portal.ver],
  ])('%s el botón al portal dice lo que corresponde y lleva a /login desde /tickets', async (_caso, cambios, texto) => {
    const { router } = montar(undefined, { [RUTA]: () => respuesta(200, consulta(cambios)) })
    consultar()

    fireEvent.click(await screen.findByRole('link', { name: texto }))

    expect(await screen.findByText('pantalla-de-login')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ desde: '/tickets' })
  })

  it('un cierre automático lo dice', async () => {
    montar(undefined, {
      [RUTA]: () =>
        respuesta(
          200,
          consulta({
            estado: 'cerrada',
            cierreAutomatico: true,
            cerradoEn: '2026-11-01T15:00:00.000Z',
            solucion: { descripcion: 'Se rellenó', resueltaEn: '2026-10-24T15:00:00.000Z' },
          }),
        ),
    })
    consultar()
    expect(await screen.findByText(textos.cierreAutomatico)).toBeInTheDocument()
  })

  it.each([
    [404, 'CONSULTA_NO_ENCONTRADA'],
    [429, 'DEMASIADAS_PETICIONES'],
  ] as const)('un %i muestra su mensaje', async (status, codigo) => {
    montar(undefined, { [RUTA]: () => respuesta(status, { codigo, mensaje: 'x' }) })
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent(textos.errores[codigo])
  })

  it('el resultado se anuncia con aria-live y no se guarda en el navegador', async () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem')
    montar(undefined, { [RUTA]: () => respuesta(200, consulta()) })
    consultar()

    const titulo = await screen.findByText('Bache frente a la escuela')
    expect(titulo.closest('[aria-live="polite"]')).not.toBeNull()
    expect(guardar).not.toHaveBeenCalled()
    guardar.mockRestore()
  })

  it('recargar no conserva el resultado', async () => {
    montar(undefined, { [RUTA]: () => respuesta(200, consulta()) })
    consultar()
    await screen.findByText('Bache frente a la escuela')

    cleanup()
    montar()
    await waitFor(() => expect(campoNumero()).toHaveValue(NUMERO))
    expect(screen.queryByText('Bache frente a la escuela')).not.toBeInTheDocument()
    expect(campoContacto()).toHaveValue('')
  })
})
