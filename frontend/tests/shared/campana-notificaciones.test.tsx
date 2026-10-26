import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import comun from '../../src/locales/es/comun.json'
import { CampanaNotificaciones } from '../../src/shared/notificaciones/CampanaNotificaciones'
import type { ListaNotificaciones, Notificacion } from '../../src/shared/notificaciones/notificaciones-api'
import '../../src/shared/i18n/i18n'

const { notificaciones: textos } = comun

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function notificacion(id: number, cambios: Partial<Notificacion> = {}): Notificacion {
  return {
    id,
    tipo: 'sla_alerta_respuesta',
    leida: false,
    creadoEn: '2026-11-02T20:00:00.000Z',
    ticket: { id: 40 + id, numero: `Q-2026-00000${id}`, titulo: 'Bache' },
    // 15:00 UTC = 09:00 en Guatemala.
    datos: { vence: '2026-11-03T15:00:00.000Z', umbral: 80 },
    ...cambios,
  }
}

function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Un backend en memoria: GET lista, PATCH marca una, POST marca todas.
function simularBackend(inicial: Notificacion[]) {
  let notificaciones = [...inicial]
  const fetchMock = vi.fn<typeof fetch>(async (entrada, init) => {
    const ruta = `${init?.method ?? 'GET'} ${new URL(String(entrada), 'http://localhost').pathname}`
    if (ruta === 'GET /api/v1/notificaciones') {
      const lista: ListaNotificaciones = { datos: notificaciones, noLeidas: notificaciones.filter((n) => !n.leida).length }
      return respuesta(200, lista)
    }
    const marcar = /^PATCH \/api\/v1\/notificaciones\/(\d+)$/.exec(ruta)
    if (marcar) {
      notificaciones = notificaciones.map((n) => (n.id === Number(marcar[1]) ? { ...n, leida: true } : n))
      return respuesta(200, notificaciones.find((n) => n.id === Number(marcar[1])))
    }
    if (ruta === 'POST /api/v1/notificaciones/marcar-leidas') {
      notificaciones = notificaciones.map((n) => ({ ...n, leida: true }))
      return respuesta(204)
    }
    return respuesta(404, { codigo: 'NO_ENCONTRADO', mensaje: ruta })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function montar() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <CampanaNotificaciones /> },
      { path: '/tickets/:id', element: <p>detalle-de-la-queja</p> },
    ],
    { initialEntries: ['/'] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const lecturas = (fetchMock: ReturnType<typeof simularBackend>) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET').length

describe('CampanaNotificaciones', () => {
  it('el contador muestra las no leídas, con el aria-label', async () => {
    simularBackend([notificacion(1), notificacion(2), notificacion(3, { leida: true })])
    montar()
    expect(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' })).toHaveTextContent('2')
  })

  it('el menú arma el texto traducido con el número, el umbral y la fecha en Guatemala, y marca "Nueva"', async () => {
    simularBackend([notificacion(1), notificacion(2, { tipo: 'sla_alerta_resolucion', leida: true })])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))

    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent(/La queja Q-2026-000001 llegó al 80 % del plazo de respuesta\. Vence el .*9:00/)
    expect(within(items[0]).getByText(textos.nueva)).toBeInTheDocument()
    expect(items[1]).toHaveTextContent(/plazo de resolución/)
    expect(within(items[1]).queryByText(textos.nueva)).not.toBeInTheDocument()
  })

  it('sla_escalamiento muestra el plazo que venció y la fecha en Guatemala (SPEC 32)', async () => {
    simularBackend([notificacion(1, { tipo: 'sla_escalamiento', datos: { plazo: 'respuesta', vence: '2026-11-03T15:00:00.000Z' } })])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    expect(screen.getByRole('menuitem')).toHaveTextContent(/La queja Q-2026-000001 se escaló por vencer el plazo de respuesta el .*9:00/)
  })

  it.each<[string, Record<string, unknown>, string]>([
    ['asignacion_recibida', {}, 'Te asignaron la queja Q-2026-000001'],
    ['asignacion_retirada', {}, 'La queja Q-2026-000001 se asignó a otro técnico'],
    ['comentario_nuevo', { cantidad: 1, incluyeInternas: false }, '1 comentario nuevo en Q-2026-000001'],
    ['comentario_nuevo', { cantidad: 3, incluyeInternas: false }, '3 comentarios nuevos en Q-2026-000001'],
    ['comentario_nuevo', { cantidad: 2, incluyeInternas: true }, '2 comentarios nuevos en Q-2026-000001 (incluye notas internas)'],
    ['respuesta_vecino', {}, 'El vecino respondió en Q-2026-000001. La queja volvió a En proceso'],
    ['queja_reabierta', {}, 'Se reabrió la queja Q-2026-000001'],
    ['traslado_solicitado', { solicitudId: 5 }, 'Se solicitó trasladar la queja Q-2026-000001'],
    ['traslado_resuelto', { solicitudId: 5, resultado: 'aprobada' }, 'Se aprobó el traslado de Q-2026-000001'],
    ['traslado_resuelto', { solicitudId: 5, resultado: 'rechazada' }, 'Se rechazó el traslado de Q-2026-000001'],
    ['traslado_resuelto', { solicitudId: 5, resultado: 'sin_efecto' }, 'El traslado de Q-2026-000001 quedó sin efecto'],
    ['encuesta_baja', { calificacion: 2 }, 'La queja Q-2026-000001 recibió una calificación de 2 de 5'],
  ])('%s con %j muestra su texto y abre /tickets/:id (SPEC 36)', async (tipo, datos, texto) => {
    simularBackend([notificacion(1, { tipo, datos })])
    const router = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))

    const item = screen.getByRole('menuitem')
    expect(item).toHaveTextContent(texto)
    fireEvent.click(item)
    expect(await screen.findByText('detalle-de-la-queja')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/41')
  })

  it('un traslado_resuelto con un resultado desconocido muestra el texto genérico', async () => {
    simularBackend([notificacion(1, { tipo: 'traslado_resuelto', datos: { resultado: 'otro' } })])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    expect(screen.getByRole('menuitem')).toHaveTextContent(textos.tipos.desconocido)
  })

  it('un tipo desconocido muestra el texto genérico', async () => {
    simularBackend([notificacion(1, { tipo: 'algo_nuevo' })])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    expect(screen.getByRole('menuitem')).toHaveTextContent(textos.tipos.desconocido)
  })

  it('sin notificaciones muestra el texto vacío y no ofrece "Marcar todas"', async () => {
    simularBackend([])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 0 sin leer' }))
    expect(await screen.findByText(textos.vacio)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: textos.marcarTodas })).not.toBeInTheDocument()
  })

  it('un clic marca la notificación como leída y navega a /tickets/:id', async () => {
    const fetchMock = simularBackend([notificacion(1)])
    const router = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    fireEvent.click(screen.getByRole('menuitem'))

    expect(await screen.findByText('detalle-de-la-queja')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/41')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'PATCH' && String(url).endsWith('/notificaciones/1'))).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ leida: true })
  })

  it('"Marcar todas como leídas" llama al POST y se oculta sin no leídas', async () => {
    const fetchMock = simularBackend([notificacion(1), notificacion(2)])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }))
    fireEvent.click(screen.getByRole('button', { name: textos.marcarTodas }))

    await waitFor(() => expect(screen.queryByRole('button', { name: textos.marcarTodas })).not.toBeInTheDocument())
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true)
    // El menú sigue abierto, así que la campana queda detrás del modal.
    expect(screen.getByRole('button', { name: 'Notificaciones, 0 sin leer', hidden: true })).toBeInTheDocument()
  })

  it('consulta cada 60 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = simularBackend([notificacion(1)])
    montar()
    await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' })
    expect(lecturas(fetchMock)).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await waitFor(() => expect(lecturas(fetchMock)).toBe(2))
  })
})
