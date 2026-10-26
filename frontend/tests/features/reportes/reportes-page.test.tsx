import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Indicadores, ResumenReportes } from '../../../src/features/reportes/api/reportes-api'
import { ReportesPage } from '../../../src/features/reportes/pages/ReportesPage'
import reportes from '../../../src/locales/es/reportes.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { respuesta, simularApi } from '../tickets/api-simulada'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const SIN_DATOS: Indicadores = {
  cantidad: 0,
  horasPromedioRespuesta: null,
  horasPromedioResolucion: null,
  cumplimientoRespuesta: { cumple: 0, incumple: 0, pendiente: 0, porcentaje: null },
  cumplimientoResolucion: { cumple: 0, incumple: 0, pendiente: 0, porcentaje: null },
  escaladasAbiertas: 0,
}

function resumen(cambios: Partial<ResumenReportes> = {}): ResumenReportes {
  const indicadores: Indicadores = {
    cantidad: 6,
    horasPromedioRespuesta: 6,
    horasPromedioResolucion: null,
    cumplimientoRespuesta: { cumple: 2, incumple: 1, pendiente: 1, porcentaje: 66.7 },
    cumplimientoResolucion: { cumple: 1, incumple: 2, pendiente: 1, porcentaje: 33.3 },
    escaladasAbiertas: 1,
  }
  return {
    rango: { desde: '2026-09-01', hasta: '2026-09-30' },
    total: 6,
    porEstado: [
      { estado: 'nueva', cantidad: 0 },
      { estado: 'en_revision', cantidad: 1 },
      { estado: 'rechazada', cantidad: 1 },
      { estado: 'asignada', cantidad: 1 },
      { estado: 'en_proceso', cantidad: 1 },
      { estado: 'en_espera', cantidad: 1 },
      { estado: 'resuelta', cantidad: 0 },
      { estado: 'cerrada', cantidad: 1 },
    ],
    porCategoria: [
      { id: 2, nombre: 'Baches', cantidad: 4 },
      { id: 3, nombre: 'Agua', cantidad: 2 },
    ],
    porDependencia: [
      { id: 10, nombre: 'Dirección de Obras', cantidad: 3 },
      { id: 11, nombre: 'Agua Potable', cantidad: 2 },
      { id: null, nombre: null, cantidad: 1 },
    ],
    porZona: [
      { id: 20, nombre: 'Zona 1', tipo: 'zona', cantidad: 4 },
      { id: 21, nombre: 'El Mirador', tipo: 'colonia', cantidad: 2 },
    ],
    indicadores,
    indicadoresPorDependencia: [{ id: 10, nombre: 'Dirección de Obras', ...indicadores, cantidad: 3 }],
    indicadoresPorCategoria: [{ id: 2, nombre: 'Baches', ...indicadores, cantidad: 4 }],
    generadoEn: '2026-10-26T15:00:00.000Z',
    ...cambios,
  }
}

function montar({
  ruta = '/reportes',
  rol = 'supervisor' as Rol,
  manejador = () => respuesta(200, resumen()),
}: { ruta?: string; rol?: Rol; manejador?: (url: URL) => Response } = {}) {
  const fetchMock = simularApi({ 'GET /reportes/resumen': (url) => manejador(url) })
  const router = createMemoryRouter([{ path: '/reportes', element: <ReportesPage /> }], { initialEntries: [ruta] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={{ usuarioId: 1, nombre: 'Usuario Prueba', rol, dependenciaId: rol === 'coordinador' ? 10 : null }}>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { fetchMock, router }
}

const consultas = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/reportes/resumen'))

describe('ReportesPage', () => {
  it('sin filtros pide los últimos 30 días de Guatemala, con una sola petición', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T03:00:00.000Z') }) // 30 de octubre, 21:00 en Guatemala
    const { fetchMock, router } = montar()
    await screen.findByRole('article', { name: reportes.tarjetas.total })
    const pedidas = consultas(fetchMock)
    expect(pedidas).toHaveLength(1)
    expect(pedidas[0].searchParams.get('desde')).toBe('2026-10-01')
    expect(pedidas[0].searchParams.get('hasta')).toBe('2026-10-30')
    expect([...pedidas[0].searchParams.keys()]).toEqual(['desde', 'hasta'])
    expect(router.state.location.search).toBe('')
  })

  it('las tarjetas muestran los indicadores y "—" cuando el valor es null', async () => {
    montar()
    const total = await screen.findByRole('article', { name: reportes.tarjetas.total })
    expect(within(total).getByText('6')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: reportes.tarjetas.horasRespuesta })).getByText('6 h')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: reportes.tarjetas.horasResolucion })).getByText('—')).toBeInTheDocument()
    const cumplimiento = screen.getByRole('article', { name: reportes.tarjetas.cumplimientoRespuesta })
    expect(within(cumplimiento).getByText('66.7 %')).toBeInTheDocument()
    expect(within(cumplimiento).getByText('Cumple 2 · Incumple 1 · Pendiente 1')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: reportes.tarjetas.escaladas })).getByText('1')).toBeInTheDocument()
  })

  it('aplicar los filtros actualiza la URL y la consulta; las opciones salen del resumen', async () => {
    const { fetchMock, router } = montar({ ruta: '/reportes?desde=2026-09-01&hasta=2026-09-30' })
    await screen.findByRole('article', { name: reportes.tarjetas.total })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: reportes.filtros.categoria }))
    fireEvent.click(await screen.findByRole('option', { name: 'Agua' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: reportes.filtros.prioridad }))
    fireEvent.click(await screen.findByRole('option', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: reportes.filtros.aplicar }))

    await waitFor(() => expect(router.state.location.search).toBe('?desde=2026-09-01&hasta=2026-09-30&categoriaId=3&prioridad=alta'))
    await waitFor(() => expect(consultas(fetchMock).at(-1)!.searchParams.get('categoriaId')).toBe('3'))
    expect(consultas(fetchMock).at(-1)!.searchParams.get('prioridad')).toBe('alta')

    fireEvent.click(screen.getByRole('button', { name: reportes.filtros.limpiar }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('el coordinador no ve el selector de dependencia; el supervisor sí', async () => {
    montar({ rol: 'coordinador' })
    await screen.findByRole('article', { name: reportes.tarjetas.total })
    expect(screen.queryByRole('combobox', { name: reportes.filtros.dependencia })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: reportes.filtros.categoria })).toBeInTheDocument()
  })

  it('sin quejas en el rango muestra el mensaje vacío', async () => {
    montar({ manejador: () => respuesta(200, resumen({ total: 0, indicadores: SIN_DATOS, porCategoria: [], porDependencia: [], porZona: [] })) })
    expect(await screen.findByText('No hay quejas registradas entre el 01/09/2026 y el 30/09/2026.')).toBeInTheDocument()
  })

  it('un error muestra "Reintentar", que vuelve a pedir el resumen', async () => {
    let intentos = 0
    const { fetchMock } = montar({
      manejador: () => (++intentos === 1 ? respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) : respuesta(200, resumen())),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(reportes.errorCarga)
    fireEvent.click(screen.getByRole('button', { name: reportes.reintentar }))
    expect(await screen.findByRole('article', { name: reportes.tarjetas.total })).toBeInTheDocument()
    expect(consultas(fetchMock).length).toBeGreaterThanOrEqual(2)
  })

  it('RANGO_INVALIDO se muestra en el campo de fechas, no como error general', async () => {
    montar({
      ruta: '/reportes?desde=2025-01-01&hasta=2026-09-30',
      manejador: () => respuesta(400, { codigo: 'RANGO_INVALIDO', mensaje: 'x' }),
    })
    expect(await screen.findByText(reportes.rangoInvalido)).toBeInTheDocument()
    expect(screen.getByLabelText(reportes.filtros.desde)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(reportes.errorCarga)).not.toBeInTheDocument()
  })

  it('cada gráfica ofrece su tabla con los mismos números, con "Sin dependencia"', async () => {
    montar()
    const grafica = await screen.findByRole('region', { name: reportes.graficas.porDependencia })
    fireEvent.click(within(grafica).getByRole('button', { name: reportes.graficas.verTabla }))
    const filas = within(within(grafica).getByRole('table')).getAllByRole('row').slice(1)
    expect(filas.map((f) => f.textContent)).toEqual(['Dirección de Obras3', 'Agua Potable2', 'Sin dependencia1'])

    const estados = screen.getByRole('region', { name: reportes.graficas.porEstado })
    fireEvent.click(within(estados).getByRole('button', { name: reportes.graficas.verTabla }))
    expect(within(within(estados).getByRole('table')).getByRole('rowheader', { name: 'En revisión' })).toBeInTheDocument()
  })
})
