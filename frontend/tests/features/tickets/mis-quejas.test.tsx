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
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { misQuejas, estados } = tickets
const { grupos } = misQuejas

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function queja(cambios: Partial<TicketListado> = {}): TicketListado {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    titulo: 'Bache frente a la escuela',
    estado: 'en_proceso',
    creadoEn: '2026-10-20T15:00:00.000Z',
    esperaRespuesta: false,
    confirmacionVenceEn: null,
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

// Un listado y un resumen por defecto; cada prueba reemplaza lo que necesite.
function simular(rutas: Record<string, Manejador> = {}) {
  return simularApi({
    'GET /tickets': () => respuesta(200, pagina([queja()])),
    'GET /tickets/resumen': () => respuesta(200, resumen({ en_proceso: 1 })),
    ...rutas,
  })
}

function montar(rol: Rol = 'vecino', ruta = '/tickets') {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets',
        element: (
          <SessionProvider session={{ usuarioId: 7, nombre: 'Vecina Prueba', rol, dependenciaId: null }}>
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

const tarjeta = (numero: string) => screen.findByRole('link', { name: misQuejas.abrir.replace('{{numero}}', numero) })
const chip = (nombre: string) => screen.findByRole('button', { name: new RegExp(`^${nombre}`) })
const consultasA = (fetchMock: ReturnType<typeof simular>, ruta: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((url) => url.pathname === `/api/v1${ruta}`)

describe('MisQuejas', () => {
  it('lista las quejas con la marca "Necesita tu respuesta" solo en las que están en espera', async () => {
    const fetchMock = simular({
      'GET /tickets': () =>
        respuesta(200, pagina([queja({ id: 2, numero: 'Q-2026-000002', estado: 'en_espera', esperaRespuesta: true }), queja()])),
    })

    montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(misQuejas.titulo)
    const enEspera = await tarjeta('Q-2026-000002')
    expect(enEspera).toHaveAttribute('href', '/tickets/2')
    expect(within(enEspera).getByText(misQuejas.necesitaRespuesta)).toBeInTheDocument()
    const enProceso = await tarjeta('Q-2026-000001')
    expect(enProceso).toHaveTextContent('Bache frente a la escuela')
    expect(enProceso).not.toHaveTextContent(misQuejas.necesitaRespuesta)
    const [url] = consultasA(fetchMock, '/tickets')
    expect(url.searchParams.get('pagina')).toBe('1')
    expect(url.searchParams.getAll('estado')).toEqual([])
  })

  it('muestra el estado con su texto, no solo con el color', async () => {
    simular({
      'GET /tickets': () =>
        respuesta(
          200,
          pagina([queja({ estado: 'en_espera', esperaRespuesta: true }), queja({ id: 2, numero: 'Q-2026-000002', estado: 'rechazada' })]),
        ),
    })

    montar()

    expect(within(await tarjeta('Q-2026-000001')).getByText(estados.en_espera)).toBeInTheDocument()
    expect(within(await tarjeta('Q-2026-000002')).getByText(estados.rechazada)).toBeInTheDocument()
  })

  it('sin quejas, el mensaje vacío lleva a /tickets/nueva', async () => {
    simular({
      'GET /tickets': () => respuesta(200, pagina([])),
      'GET /tickets/resumen': () => respuesta(200, resumen()),
    })

    montar()

    expect(await screen.findByText(misQuejas.vacia)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: misQuejas.registrar })).toHaveAttribute('href', '/tickets/nueva')
  })

  it('un error al cargar ofrece reintentar', async () => {
    simular({ 'GET /tickets': () => respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) })

    montar()

    expect(await screen.findByRole('alert')).toHaveTextContent(misQuejas.errorCarga)
    expect(screen.getByRole('button', { name: misQuejas.reintentar })).toBeInTheDocument()
  })

  it.each<Rol>(['receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'])(
    'el rol %s ve el placeholder y no pide el listado',
    (rol) => {
      const fetchMock = simularApi({})

      montar(rol)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tickets.listado.titulo)
      expect(screen.getByText(comun.placeholder.proximamente)).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  describe('filtros (SPEC 38)', () => {
    it('los chips muestran los contadores; elegir uno pide sus estados, escribe ?grupo= y queda marcado', async () => {
      const fetchMock = simular({ 'GET /tickets/resumen': () => respuesta(200, resumen({ en_espera: 2, nueva: 1, asignada: 1, cerrada: 1 })) })
      const router = montar()

      // Los contadores llegan con el resumen.
      expect(await screen.findByRole('button', { name: `${grupos.todas} (5)` })).toBeInTheDocument()
      expect(await chip(grupos.respuesta)).toHaveTextContent(`${grupos.respuesta} (2)`)
      expect(await chip(grupos.en_curso)).toHaveTextContent(`${grupos.en_curso} (2)`)
      expect(await chip(grupos.finalizadas)).toHaveTextContent(`${grupos.finalizadas} (1)`)
      expect(await chip(grupos.todas)).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(await chip(grupos.en_curso))

      await waitFor(() => expect(router.state.location.search).toBe('?grupo=en_curso'))
      expect(await chip(grupos.en_curso)).toHaveAttribute('aria-pressed', 'true')
      expect(await chip(grupos.todas)).toHaveAttribute('aria-pressed', 'false')
      await waitFor(() =>
        expect(consultasA(fetchMock, '/tickets').at(-1)!.searchParams.getAll('estado')).toEqual([
          'nueva',
          'en_revision',
          'asignada',
          'en_proceso',
        ]),
      )
    })

    it('Atrás restaura el grupo anterior, y la URL con un grupo desconocido es "Todas"', async () => {
      const router = montar('vecino', '/tickets?grupo=finalizadas')
      expect(await chip(grupos.finalizadas)).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(await chip(grupos.respuesta))
      await waitFor(() => expect(router.state.location.search).toBe('?grupo=respuesta'))
      await act(() => router.navigate(-1))

      expect(router.state.location.search).toBe('?grupo=finalizadas')
      expect(await chip(grupos.finalizadas)).toHaveAttribute('aria-pressed', 'true')

      await act(() => router.navigate('/tickets?grupo=inventado'))
      expect(await chip(grupos.todas)).toHaveAttribute('aria-pressed', 'true')
    })

    it('la búsqueda espera 300 ms, vuelve a la página 1 y no envía menos de 2 caracteres', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const fetchMock = simular()
      const router = montar('vecino', '/tickets?grupo=en_curso&pagina=3')
      const campo = await screen.findByRole('searchbox', { name: misQuejas.busqueda.etiqueta })

      fireEvent.change(campo, { target: { value: 'b' } })
      await act(() => vi.advanceTimersByTimeAsync(300))
      expect(router.state.location.search).toBe('?grupo=en_curso')
      expect(consultasA(fetchMock, '/tickets').every((url) => !url.searchParams.has('q'))).toBe(true)

      fireEvent.change(campo, { target: { value: 'bache' } })
      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(router.state.location.search).toBe('?grupo=en_curso')
      await act(() => vi.advanceTimersByTimeAsync(100))

      expect(router.state.location.search).toBe('?grupo=en_curso&q=bache')
      await waitFor(() => {
        expect(consultasA(fetchMock, '/tickets').at(-1)!.searchParams.get('q')).toBe('bache')
        expect(consultasA(fetchMock, '/tickets/resumen').at(-1)!.searchParams.get('q')).toBe('bache')
      })
    })

    it('"Confirma la solución antes del…" aparece solo con el plazo vigente, en hora de Guatemala', async () => {
      simular({
        'GET /tickets': () =>
          respuesta(
            200,
            pagina([
              // 05:59:59.999 UTC del 31 de octubre es el 30 a las 23:59 en Guatemala.
              queja({ estado: 'resuelta', confirmacionVenceEn: '2099-10-31T05:59:59.999Z' }),
              queja({ id: 2, numero: 'Q-2026-000002', estado: 'resuelta', confirmacionVenceEn: '2020-01-01T00:00:00.000Z' }),
            ]),
          ),
      })

      montar()

      expect(await tarjeta('Q-2026-000001')).toHaveTextContent(/Confirma la solución antes del 30 oct 2099.*23:59/)
      expect(await tarjeta('Q-2026-000002')).not.toHaveTextContent('Confirma la solución')
    })

    it('distingue un grupo vacío y una búsqueda sin resultados, con "Limpiar búsqueda"', async () => {
      simular({
        'GET /tickets': (url) => respuesta(200, url.searchParams.has('estado') || url.searchParams.has('q') ? pagina([]) : pagina([queja()])),
        'GET /tickets/resumen': (url) => respuesta(200, url.searchParams.has('q') ? resumen() : resumen({ en_proceso: 1 })),
      })
      const router = montar('vecino', '/tickets?grupo=finalizadas')

      expect(await screen.findByText(misQuejas.vacioGrupo)).toBeInTheDocument()
      expect(screen.queryByText(misQuejas.vacia)).not.toBeInTheDocument()

      await act(() => router.navigate('/tickets?q=lampara'))
      expect(await screen.findByText('No encontramos quejas con «lampara».')).toBeInTheDocument()
      // El del aviso: el campo de búsqueda tiene otro botón con el mismo nombre.
      const aviso = screen.getByText('No encontramos quejas con «lampara».').closest('.MuiAlert-root') as HTMLElement
      fireEvent.click(within(aviso).getByRole('button', { name: misQuejas.busqueda.limpiar }))

      await waitFor(() => expect(router.state.location.search).toBe(''))
      expect(await tarjeta('Q-2026-000001')).toBeInTheDocument()
    })
  })
})
