import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SolicitudTraslado } from '../../../src/features/tickets/api/traslados-api'
import { TrasladosPage } from '../../../src/features/tickets/traslados/TrasladosPage'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, renderConConsultas, respuesta, simularApi } from './api-simulada'

const { traslados } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function solicitud(cambios: Partial<SolicitudTraslado> = {}): SolicitudTraslado {
  return {
    id: 3,
    estado: 'pendiente',
    motivo: 'Es una fuga de agua',
    ticket: { id: 8, numero: 'Q-2026-000008', titulo: 'Fuga reportada como bache', estado: 'en_proceso' },
    dependenciaOrigen: { id: 4, nombre: 'Dirección de Obras' },
    dependenciaSugerida: { id: 5, nombre: 'Agua Potable' },
    solicitadoPor: { id: 30, nombre: 'Luis Técnico', rol: 'tecnico' },
    resueltoPor: null,
    motivoResolucion: null,
    creadoEn: new Date(Date.now() - 2 * 3600_000).toISOString(),
    resueltoEn: null,
    ...cambios,
  }
}

const pagina = (datos: SolicitudTraslado[], total = datos.length) => ({ datos, pagina: 1, tamano: 20, total })

function montar(rutas: Record<string, Manejador>) {
  const fetchMock = simularApi({ 'GET /traslados': () => respuesta(200, pagina([solicitud()])), ...rutas })
  renderConConsultas(<TrasladosPage />)
  return fetchMock
}

const consultas = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname === '/api/v1/traslados')
    .map((url) => url.searchParams)

const llamadasPost = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

describe('TrasladosPage', () => {
  it('las tarjetas muestran origen, sugerencia, quién lo pide con su rol, el motivo y la antigüedad', async () => {
    montar({})

    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000008' })
    expect(within(tarjeta).getByText('Fuga reportada como bache')).toBeInTheDocument()
    expect(tarjeta).toHaveTextContent('Desde: Dirección de Obras')
    expect(tarjeta).toHaveTextContent('Sugerencia: Agua Potable')
    expect(tarjeta).toHaveTextContent('Pide: Luis Técnico (Técnico)')
    expect(tarjeta).toHaveTextContent('hace 2 h')
    expect(tarjeta).toHaveTextContent('Motivo: Es una fuga de agua')
    expect(within(tarjeta).getByText(traslados.estados.pendiente)).toBeInTheDocument()
  })

  it('pide las pendientes por defecto y el filtro cambia la consulta', async () => {
    const fetchMock = montar({})
    await screen.findByRole('article', { name: 'Q-2026-000008' })

    fireEvent.click(screen.getByRole('button', { name: traslados.filtro.aprobada }))
    await waitFor(() => expect(consultas(fetchMock)).toHaveLength(2))

    expect(consultas(fetchMock).map((q) => q.get('estado'))).toEqual(['pendiente', 'aprobada'])
  })

  it('"Aprobar" pide confirmación y después aprueba, recarga y avisa', async () => {
    const fetchMock = montar({ 'POST /traslados/3/aprobacion': () => respuesta(200, { solicitud: solicitud({ estado: 'aprobada' }) }) })
    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000008' })

    fireEvent.click(within(tarjeta).getByRole('button', { name: traslados.acciones.aprobar }))
    const dialogo = await screen.findByRole('dialog', { name: traslados.acciones.confirmarTitulo })
    expect(dialogo).toHaveTextContent('La queja Q-2026-000008 volverá a revisión sin dependencia ni técnico.')
    expect(llamadasPost(fetchMock)).toHaveLength(0)

    fireEvent.click(within(dialogo).getByRole('button', { name: traslados.acciones.confirmar }))

    expect(await screen.findByText(traslados.avisos.aprobada)).toBeInTheDocument()
    expect(llamadasPost(fetchMock)).toHaveLength(1)
    await waitFor(() => expect(consultas(fetchMock)).toHaveLength(2))
  })

  it('"Rechazar" exige motivo y lo envía', async () => {
    const fetchMock = montar({ 'POST /traslados/3/rechazo': () => respuesta(200, { solicitud: solicitud({ estado: 'rechazada' }) }) })
    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000008' })

    fireEvent.click(within(tarjeta).getByRole('button', { name: traslados.acciones.rechazar }))
    fireEvent.click(within(tarjeta).getByRole('button', { name: traslados.acciones.confirmarRechazo }))
    expect(await within(tarjeta).findByText(traslados.acciones.motivoRequerido)).toBeInTheDocument()
    expect(llamadasPost(fetchMock)).toHaveLength(0)

    fireEvent.change(within(tarjeta).getByRole('textbox', { name: new RegExp(traslados.acciones.motivoRechazo) }), {
      target: { value: 'Sí es un bache' },
    })
    fireEvent.click(within(tarjeta).getByRole('button', { name: traslados.acciones.confirmarRechazo }))

    expect(await screen.findByText(traslados.avisos.rechazada)).toBeInTheDocument()
    expect(JSON.parse(llamadasPost(fetchMock)[0][1]?.body as string)).toEqual({ motivo: 'Sí es un bache' })
  })

  it.each([
    ['TRASLADO_YA_RESUELTO', traslados.avisos.yaResuelta],
    ['TRASLADO_SIN_EFECTO', traslados.avisos.sinEfecto],
  ])('un 409 %s muestra su aviso', async (codigo, mensaje) => {
    montar({ 'POST /traslados/3/aprobacion': () => respuesta(409, { codigo, mensaje: 'x' }) })
    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000008' })

    fireEvent.click(within(tarjeta).getByRole('button', { name: traslados.acciones.aprobar }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: traslados.acciones.confirmar }))

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
  })

  it('una solicitud resuelta no tiene acciones y muestra el motivo del rechazo', async () => {
    montar({
      'GET /traslados': () =>
        respuesta(200, pagina([solicitud({ estado: 'rechazada', motivoResolucion: 'Sí es un bache', dependenciaSugerida: null })])),
    })

    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000008' })
    expect(tarjeta).toHaveTextContent('Motivo del rechazo: Sí es un bache')
    expect(tarjeta).toHaveTextContent(traslados.sinSugerencia)
    expect(within(tarjeta).queryByRole('button', { name: traslados.acciones.aprobar })).not.toBeInTheDocument()
  })

  it('la paginación pide la página elegida', async () => {
    const fetchMock = montar({ 'GET /traslados': () => respuesta(200, pagina([solicitud()], 45)) })
    await screen.findByRole('article', { name: 'Q-2026-000008' })

    fireEvent.click(within(screen.getByRole('navigation', { name: traslados.paginacion })).getByRole('button', { name: /2/ }))

    await waitFor(() => expect(consultas(fetchMock).at(-1)?.get('pagina')).toBe('2'))
  })
})
