import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResumenTickets, TicketListado } from '../../../src/features/tickets/api/tickets-api'
import { TicketsPage } from '../../../src/features/tickets/pages/TicketsPage'
import comun from '../../../src/locales/es/comun.json'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { CATEGORIAS, type Manejador, respuesta, simularApi } from './api-simulada'

const { listadoInterno, estados } = tickets
const { filtros } = listadoInterno

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Pantalla ancha (md o más): useMediaQuery ve las consultas min-width como verdaderas.
function pantallaAncha() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function queja(cambios: Partial<TicketListado> = {}): TicketListado {
  return {
    id: 15,
    numero: 'Q-2026-000015',
    titulo: 'Bache frente a la escuela',
    estado: 'en_proceso',
    creadoEn: '2026-10-20T15:00:00.000Z',
    esperaRespuesta: false,
    confirmacionVenceEn: null,
    pendienteCalificar: false,
    interno: {
      prioridad: 'alta',
      categoria: { id: 2, nombre: 'Baches' },
      dependencia: { id: 10, nombre: 'Dirección de Obras' },
      tecnico: { id: 30, nombre: 'Técnico de desarrollo' },
      sla: {
        venceRespuesta: null,
        primeraRespuestaEn: null,
        venceResolucion: null,
        pausado: false,
        restanteMinutosEnPausa: null,
        escalado: true,
        escaladoEn: '2026-10-21T15:00:00.000Z',
        escaladoPor: 'respuesta',
      },
    },
    ...cambios,
  }
}

const pagina = (datos: TicketListado[], total = datos.length) => ({ datos, pagina: 1, tamano: 20, total })

function resumen(porEstado: Partial<ResumenTickets['porEstado']> = {}): ResumenTickets {
  const completo = {
    nueva: 0,
    en_revision: 0,
    asignada: 0,
    en_proceso: 0,
    en_espera: 0,
    resuelta: 0,
    cerrada: 0,
    rechazada: 0,
    ...porEstado,
  }
  return { porEstado: completo, total: Object.values(completo).reduce((a, b) => a + b, 0) }
}

function simular(rutas: Record<string, Manejador> = {}) {
  return simularApi({
    'GET /tickets': () => respuesta(200, pagina([queja()])),
    'GET /tickets/resumen': () => respuesta(200, resumen({ en_proceso: 1, nueva: 3 })),
    'GET /categorias': () => respuesta(200, CATEGORIAS),
    'GET /dependencias': () => respuesta(200, [{ id: 10, nombre: 'Dirección de Obras' }, { id: 20, nombre: 'Servicios Públicos' }]),
    ...rutas,
  })
}

function montar(rol: Rol = 'supervisor', ruta = '/tickets') {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets',
        element: (
          <SessionProvider session={{ usuarioId: 5, nombre: 'Interna', rol, dependenciaId: rol === 'coordinador' ? 10 : null }}>
            <TicketsPage />
          </SessionProvider>
        ),
      },
      { path: '/tickets/:id', element: <p>Detalle de la queja</p> },
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

// Las URL de las peticiones a una ruta, para revisar sus parámetros.
const pedidos = (fetchMock: ReturnType<typeof simular>, ruta: string) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname === `/api/v1${ruta}`)

// Abre un selector de MUI por su etiqueta y elige una opción.
async function elegir(etiqueta: string, opcion: RegExp | string) {
  fireEvent.mouseDown(screen.getByLabelText(etiqueta))
  fireEvent.click(await screen.findByRole('option', { name: opcion }))
}

describe('Listado interno (SPEC 45)', () => {
  it('el vecino sigue viendo "Mis quejas"', async () => {
    simular()
    montar('vecino')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tickets.misQuejas.titulo)
  })

  it('el supervisor ve el listado con los estados activos y los últimos 30 días, sin escribirlos en la URL', async () => {
    const fetchMock = simular()
    const router = montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(listadoInterno.titulo)
    expect(screen.queryByText(comun.placeholder.proximamente)).not.toBeInTheDocument()
    expect(await screen.findByText('Bache frente a la escuela')).toBeInTheDocument()

    const [url] = pedidos(fetchMock, '/tickets')
    expect(url.searchParams.getAll('estado')).toEqual(['nueva', 'en_revision', 'asignada', 'en_proceso', 'en_espera', 'resuelta'])
    expect(url.searchParams.get('desde')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(url.searchParams.get('hasta')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(router.state.location.search).toBe('')
  })

  it('los contadores del selector de estados salen de /tickets/resumen', async () => {
    simular()
    montar()

    fireEvent.mouseDown(await screen.findByLabelText(filtros.estados))
    expect(await screen.findByRole('option', { name: `${estados.nueva} (3)` })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: `${estados.en_proceso} (1)` })).toBeInTheDocument()
  })

  it('elegir una categoría cambia la consulta y escribe ?categoriaId=; Atrás restaura el filtro anterior', async () => {
    const fetchMock = simular()
    const router = montar()
    await screen.findByText('Bache frente a la escuela')

    await elegir(filtros.categoria, 'Baches')

    await waitFor(() => expect(router.state.location.search).toBe('?categoriaId=2'))
    await waitFor(() => expect(pedidos(fetchMock, '/tickets').at(-1)!.searchParams.get('categoriaId')).toBe('2'))
    expect(pedidos(fetchMock, '/tickets/resumen').at(-1)!.searchParams.get('categoriaId')).toBe('2')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
  })

  it('cambiar un filtro vuelve a la página 1', async () => {
    simular()
    const router = montar('supervisor', '/tickets?pagina=3')
    await screen.findByText('Bache frente a la escuela')

    await elegir(filtros.prioridad, comun.prioridades.urgente)

    await waitFor(() => expect(router.state.location.search).toBe('?prioridad=urgente'))
  })

  it('el selector de dependencia se oculta para el coordinador y se muestra al supervisor', async () => {
    simular()
    montar('coordinador')
    await screen.findByText('Bache frente a la escuela')
    expect(screen.queryByLabelText(filtros.dependencia)).not.toBeInTheDocument()
  })

  it('el supervisor filtra por dependencia', async () => {
    const fetchMock = simular()
    const router = montar()
    await screen.findByText('Bache frente a la escuela')

    await elegir(filtros.dependencia, 'Servicios Públicos')

    await waitFor(() => expect(router.state.location.search).toBe('?dependenciaId=20'))
    await waitFor(() => expect(pedidos(fetchMock, '/tickets').at(-1)!.searchParams.get('dependenciaId')).toBe('20'))
  })

  it('"Solo escaladas" envía escalado=true', async () => {
    pantallaAncha()
    const fetchMock = simular()
    const router = montar()
    await screen.findByText('Bache frente a la escuela')

    fireEvent.click(screen.getByRole('switch', { name: filtros.soloEscaladas }))

    await waitFor(() => expect(router.state.location.search).toBe('?escalado=true'))
    await waitFor(() => expect(pedidos(fetchMock, '/tickets').at(-1)!.searchParams.get('escalado')).toBe('true'))
  })

  it('la búsqueda espera 300 ms y no envía menos de 2 caracteres', async () => {
    pantallaAncha()
    const fetchMock = simular()
    const router = montar()
    await screen.findByText('Bache frente a la escuela')
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const campo = screen.getByRole('searchbox', { name: filtros.busqueda })
    fireEvent.change(campo, { target: { value: 'b' } })
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    expect(router.state.location.search).toBe('')

    fireEvent.change(campo, { target: { value: 'bache' } })
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    await waitFor(() => expect(router.state.location.search).toBe('?q=bache'))
    await waitFor(() => expect(pedidos(fetchMock, '/tickets').at(-1)!.searchParams.get('q')).toBe('bache'))
  })

  it('en celular, cada tarjeta enlaza al detalle y una queja sin dependencia muestra "Sin dependencia"', async () => {
    simular({
      'GET /tickets': () =>
        respuesta(200, pagina([queja({ id: 22, numero: 'Q-2026-000022', estado: 'nueva', interno: { ...queja().interno!, dependencia: null, tecnico: null, prioridad: null } })])),
    })
    montar()

    const enlace = await screen.findByRole('link', { name: listadoInterno.abrir.replace('{{numero}}', 'Q-2026-000022') })
    expect(enlace).toHaveAttribute('href', '/tickets/22')
    expect(within(enlace).getByText(new RegExp(listadoInterno.sinDependencia))).toBeInTheDocument()
    expect(within(enlace).getByText(listadoInterno.sinPrioridad)).toBeInTheDocument()
  })

  it('en pantalla ancha muestra una tabla con caption, encabezados y la marca "Escalada"', async () => {
    pantallaAncha()
    simular()
    montar()

    const tabla = await screen.findByRole('table', { name: listadoInterno.tabla.caption })
    expect(within(tabla).getByRole('columnheader', { name: listadoInterno.tabla.numero })).toHaveAttribute('scope', 'col')
    const enlace = within(tabla).getByRole('link', { name: listadoInterno.abrir.replace('{{numero}}', 'Q-2026-000015') })
    expect(enlace).toHaveAttribute('href', '/tickets/15')
    expect(within(tabla).getByText(tickets.sla.escalada)).toBeInTheDocument()
    expect(within(tabla).getByText('Técnico de desarrollo')).toBeInTheDocument()
  })

  it('en celular los filtros se pliegan y el título cuenta los activos', async () => {
    simular()
    montar('supervisor', '/tickets?prioridad=alta&escalado=true')
    await screen.findByText('Bache frente a la escuela')

    const resumenFiltros = screen.getByRole('button', { name: filtros.tituloActivos_other.replace('{{count}}', '2') })
    expect(resumenFiltros).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(resumenFiltros)
    expect(await screen.findByRole('switch', { name: filtros.soloEscaladas })).toBeChecked()
  })

  it('un error al cargar ofrece reintentar', async () => {
    simular({ 'GET /tickets': () => respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) })
    montar()

    expect(await screen.findByRole('alert')).toHaveTextContent(listadoInterno.errorCarga)
    expect(screen.getByRole('button', { name: listadoInterno.reintentar })).toBeInTheDocument()
  })

  it('mientras carga muestra el esqueleto', () => {
    simular({ 'GET /tickets': () => new Promise<Response>(() => {}) })
    montar()

    expect(screen.getByLabelText(listadoInterno.cargando)).toHaveAttribute('aria-busy', 'true')
  })

  it('sin quejas en el alcance: "Todavía no hay quejas"', async () => {
    simular({ 'GET /tickets': () => respuesta(200, pagina([])) })
    montar()

    expect(await screen.findByText(listadoInterno.vacioTotal)).toBeInTheDocument()
  })

  it('sin resultados con filtros: el mensaje y "Limpiar filtros" vuelve a los valores por defecto', async () => {
    simular({ 'GET /tickets': () => respuesta(200, pagina([])) })
    const router = montar('supervisor', '/tickets?prioridad=baja')

    expect(await screen.findByText(listadoInterno.vacioFiltros)).toBeInTheDocument()
    const alerta = screen.getByText(listadoInterno.vacioFiltros).closest('[role="alert"], .MuiAlert-root') as HTMLElement
    fireEvent.click(within(alerta).getByRole('button', { name: filtros.limpiar }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
  })
})
