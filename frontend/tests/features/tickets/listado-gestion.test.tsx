import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpcionesGestion, TicketGestion } from '../../../src/features/tickets/api/gestion-api'
import { TicketsPage } from '../../../src/features/tickets/pages/TicketsPage'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { gestion, misQuejas } = tickets
const { filtros: textos } = gestion

afterEach(() => {
  vi.unstubAllGlobals()
})

function queja(id: number, cambios: Partial<TicketGestion> = {}): TicketGestion {
  return {
    id,
    numero: `Q-2026-00000${id}`,
    titulo: `Bache ${id}`,
    estado: 'asignada',
    prioridad: 'alta',
    categoria: { id: 1, nombre: 'Baches' },
    dependencia: { id: 10, nombre: 'Dirección de Obras' },
    zona: { id: 3, nombre: 'Zona 1' },
    tecnico: null,
    creadoEn: '2026-10-20T15:00:00.000Z',
    sla: {
      venceRespuesta: null,
      primeraRespuestaEn: null,
      venceResolucion: null,
      pausado: false,
      restanteMinutosEnPausa: null,
      escalado: false,
      escaladoEn: null,
      escaladoPor: null,
    },
    ...cambios,
  }
}

const OPCIONES_TODAS: OpcionesGestion = {
  dependencias: [
    { id: 10, nombre: 'Dirección de Obras', activa: true },
    { id: 20, nombre: 'Agua Potable', activa: false },
  ],
  categorias: [
    { id: 1, nombre: 'Baches', dependenciaId: 10, activa: true },
    { id: 2, nombre: 'Fugas', dependenciaId: 20, activa: true },
  ],
  tecnicos: [
    { id: 7, nombre: 'Luis Técnico', dependenciaId: 10, activo: true },
    { id: 8, nombre: 'Ana Fontanera', dependenciaId: 20, activo: true },
  ],
}

const OPCIONES_COORDINADOR: OpcionesGestion = {
  dependencias: [OPCIONES_TODAS.dependencias[0]],
  categorias: [OPCIONES_TODAS.categorias[0]],
  tecnicos: [OPCIONES_TODAS.tecnicos[0]],
}

const pagina = (datos: TicketGestion[], total = datos.length) => ({ datos, pagina: 1, tamano: 20, total })

function simular(rutas: Record<string, Manejador> = {}, opciones = OPCIONES_TODAS) {
  return simularApi({
    'GET /tickets/gestion': () => respuesta(200, pagina([queja(1), queja(2, { tecnico: { id: 7, nombre: 'Luis Técnico' } })])),
    'GET /tickets/gestion/opciones': () => respuesta(200, opciones),
    ...rutas,
  })
}

function montar(rol: Rol = 'supervisor', ruta = '/tickets') {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets',
        element: (
          <SessionProvider session={{ usuarioId: 1, nombre: 'Persona Prueba', rol, dependenciaId: null }}>
            <TicketsPage />
          </SessionProvider>
        ),
      },
    ],
    { initialEntries: [ruta] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const consultasA = (fetchMock: ReturnType<typeof simularApi>, ruta: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((url) => url.pathname === `/api/v1${ruta}`)
const combo = (nombre: string) => screen.queryByRole('combobox', { name: nombre })
const elegir = async (filtro: string, opcion: string) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: filtro }))
  fireEvent.click(await screen.findByRole('option', { name: opcion }))
}
const opcionesDe = async (filtro: string) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: filtro }))
  const lista = await screen.findByRole('listbox')
  const nombres = within(lista).getAllByRole('option').map((o) => o.textContent)
  fireEvent.keyDown(lista, { key: 'Escape' })
  return nombres
}
const abrir = (numero: string) => screen.findByRole('link', { name: gestion.abrir.replace('{{numero}}', numero) })

describe('ListadoGestion (SPEC 45)', () => {
  it('el vecino sigue viendo "Mis quejas" y no pide el listado de gestión', async () => {
    const fetchMock = simular({
      'GET /tickets': () => respuesta(200, { datos: [], pagina: 1, tamano: 20, total: 0 }),
      'GET /tickets/resumen': () => respuesta(200, { porEstado: {}, total: 0 }),
    })
    montar('vecino')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(misQuejas.titulo)
    await waitFor(() => expect(consultasA(fetchMock, '/tickets')).toHaveLength(1))
    expect(consultasA(fetchMock, '/tickets/gestion')).toHaveLength(0)
  })

  it('el supervisor ve la tabla con el filtro de dependencia y de técnico', async () => {
    const fetchMock = simular()
    montar('supervisor')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tickets.listado.titulo)
    const fila = (await abrir('Q-2026-000001')).closest('tr')!
    expect(within(fila).getByText('Bache 1')).toBeInTheDocument()
    expect(within(fila).getByText(gestion.sinAsignar)).toBeInTheDocument()
    expect(within((await abrir('Q-2026-000002')).closest('tr')!).getByText('Luis Técnico')).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: textos.dependencia })).toBeInTheDocument()
    expect(combo(textos.tecnico)).toBeInTheDocument()
    const [url] = consultasA(fetchMock, '/tickets/gestion')
    expect(url.searchParams.get('pagina')).toBe('1')
  })

  it('el coordinador ve la tabla sin el filtro de dependencia', async () => {
    simular({}, OPCIONES_COORDINADOR)
    montar('coordinador')
    await abrir('Q-2026-000001')
    expect(await screen.findByRole('combobox', { name: textos.categoria })).toBeInTheDocument()
    await waitFor(() => expect(combo(textos.tecnico)).toBeInTheDocument())
    expect(combo(textos.dependencia)).not.toBeInTheDocument()
  })

  it('el técnico no ve el filtro de técnico', async () => {
    simular({}, { ...OPCIONES_COORDINADOR, tecnicos: [] })
    montar('tecnico')
    await abrir('Q-2026-000001')
    expect(await screen.findByRole('combobox', { name: textos.categoria })).toBeInTheDocument()
    expect(combo(textos.tecnico)).not.toBeInTheDocument()
  })

  it('la fila enlaza al detalle /tickets/:id', async () => {
    simular()
    montar()
    expect(await abrir('Q-2026-000002')).toHaveAttribute('href', '/tickets/2')
  })

  it('elegir un filtro escribe la URL y vuelve a la página 1; Atrás restaura el filtro anterior', async () => {
    const fetchMock = simular({ 'GET /tickets/gestion': () => respuesta(200, pagina([queja(1)], 45)) })
    const router = montar('supervisor', '/tickets?pagina=2')
    await abrir('Q-2026-000001')
    expect(consultasA(fetchMock, '/tickets/gestion')[0].searchParams.get('pagina')).toBe('2')

    await elegir(textos.prioridad, tickets.triage.prioridades.urgente)

    await waitFor(() => expect(router.state.location.search).toBe('?prioridad=urgente'))
    const ultima = consultasA(fetchMock, '/tickets/gestion').at(-1)!
    expect(ultima.searchParams.get('prioridad')).toBe('urgente')
    expect(ultima.searchParams.get('pagina')).toBe('1')

    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('?pagina=2')
    await waitFor(() => expect(screen.getByRole('combobox', { name: textos.prioridad })).toHaveTextContent(textos.todas))
  })

  it('los estados se eligen varios y se envían repetidos', async () => {
    const fetchMock = simular()
    const router = montar()
    await abrir('Q-2026-000001')
    await elegir(textos.estados, tickets.estados.asignada)
    await waitFor(() => expect(router.state.location.search).toBe('?estado=asignada'))
    fireEvent.click(await screen.findByRole('option', { name: tickets.estados.cerrada }))
    await waitFor(() => expect(router.state.location.search).toBe('?estado=asignada&estado=cerrada'))
    await waitFor(() =>
      expect(consultasA(fetchMock, '/tickets/gestion').at(-1)!.searchParams.getAll('estado')).toEqual(['asignada', 'cerrada']),
    )
  })

  it('las categorías y los técnicos se limitan a la dependencia elegida', async () => {
    simular()
    montar('supervisor', '/tickets?dependenciaId=20')
    await abrir('Q-2026-000001')
    expect(await opcionesDe(textos.categoria)).toEqual([textos.todas, 'Fugas'])
    expect(await opcionesDe(textos.tecnico)).toEqual([textos.todosTecnicos, textos.sinAsignar, 'Ana Fontanera'])
    expect(await opcionesDe(textos.dependencia)).toEqual([textos.todas, 'Dirección de Obras', 'Agua Potable (inactiva)'])
  })

  it('cambiar de dependencia suelta la categoría y el técnico que no le pertenecen', async () => {
    simular()
    const router = montar('supervisor', '/tickets?categoriaId=1&tecnico=7')
    await abrir('Q-2026-000001')
    await elegir(textos.dependencia, 'Agua Potable (inactiva)')
    await waitFor(() => expect(router.state.location.search).toBe('?dependenciaId=20'))
  })

  it('"Sin asignar" escribe tecnico=sin_asignar', async () => {
    const fetchMock = simular()
    const router = montar()
    await abrir('Q-2026-000001')
    await elegir(textos.tecnico, textos.sinAsignar)
    await waitFor(() => expect(router.state.location.search).toBe('?tecnico=sin_asignar'))
    await waitFor(() => expect(consultasA(fetchMock, '/tickets/gestion').at(-1)!.searchParams.get('tecnico')).toBe('sin_asignar'))
  })

  it('sin quejas y sin filtros: "No hay quejas en tu alcance"', async () => {
    simular({ 'GET /tickets/gestion': () => respuesta(200, pagina([])) })
    montar()
    expect(await screen.findByText(gestion.vacioAlcance)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: gestion.limpiarFiltros })).not.toBeInTheDocument()
  })

  it('sin resultados con filtros: "Ninguna queja coincide" y "Limpiar filtros" vacía la URL', async () => {
    simular({ 'GET /tickets/gestion': () => respuesta(200, pagina([])) })
    const router = montar('supervisor', '/tickets?prioridad=baja&q=bache')
    expect(await screen.findByText(gestion.vacioFiltros)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: gestion.limpiarFiltros }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('un error muestra "Reintentar", que vuelve a pedir el listado', async () => {
    let fallar = true
    const fetchMock = simular({
      'GET /tickets/gestion': () => (fallar ? respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) : respuesta(200, pagina([queja(1)]))),
    })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent(gestion.errorCarga)
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: gestion.reintentar }))
    await abrir('Q-2026-000001')
    expect(consultasA(fetchMock, '/tickets/gestion').length).toBeGreaterThanOrEqual(2)
  })
})
