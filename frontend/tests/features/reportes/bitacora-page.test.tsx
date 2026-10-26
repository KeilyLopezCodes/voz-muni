import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaginaBitacora, RegistroBitacora } from '../../../src/features/reportes/api/bitacora-api'
import { BitacoraPage } from '../../../src/features/reportes/bitacora/BitacoraPage'
import reportes from '../../../src/locales/es/reportes.json'
import '../../../src/shared/i18n/i18n'
import { respuesta, simularApi } from '../tickets/api-simulada'

const { bitacora: textos } = reportes

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function registro(id: number, cambios: Partial<RegistroBitacora> = {}): RegistroBitacora {
  return {
    id,
    // 21:30 UTC = 15:30 en Guatemala.
    creadoEn: '2026-11-02T21:30:00.000Z',
    accion: 'ticket.asignar',
    entidad: 'ticket',
    entidadId: '15',
    ticketNumero: 'Q-2026-000015',
    usuario: { id: 7, nombre: 'Carla Coordinadora', rol: 'coordinador' },
    dependencia: { id: 4, nombre: 'Dirección de Obras' },
    ip: '10.0.0.7',
    detalle: {
      cambios: { asignadoA: { antes: null, despues: 9 } },
      datos: { motivo: 'Cambio de turno', telefono: '****0000' },
    },
    ...cambios,
  }
}

const ESCALAR = registro(2, { accion: 'ticket.escalar', usuario: null, ip: null, detalle: { datos: { plazo: 'resolucion' } } })
const ZONA = registro(3, {
  accion: 'zona.editar',
  entidad: 'zona',
  entidadId: '9',
  ticketNumero: null,
  dependencia: null,
  detalle: { cambios: { activa: { antes: true, despues: false } } },
})

function montar({
  paginas = { primera: { datos: [registro(1), ESCALAR, ZONA], siguienteCursor: null } as PaginaBitacora } as Record<string, PaginaBitacora>,
  ruta = '/bitacora',
} = {}) {
  const fetchMock = simularApi({
    'GET /bitacora/acciones': () =>
      respuesta(200, {
        datos: [
          { accion: 'ticket.aceptar', entidad: 'ticket' },
          { accion: 'ticket.asignar', entidad: 'ticket' },
          { accion: 'zona.editar', entidad: 'zona' },
          { accion: 'sesion.fallar', entidad: 'usuario' },
          { accion: 'comentario.crear', entidad: 'comentario' },
        ],
      }),
    'GET /bitacora': (url) => respuesta(200, paginas[url.searchParams.get('cursor') ?? 'primera']),
  })
  const router = createMemoryRouter([{ path: '/bitacora', element: <BitacoraPage /> }], { initialEntries: [ruta] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { fetchMock, router }
}

const consultas = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/bitacora'))
const ultimaConsulta = (fetchMock: ReturnType<typeof simularApi>) => consultas(fetchMock).at(-1)!

describe('BitacoraPage', () => {
  it('sin filtros consulta los últimos 7 días de Guatemala y no los escribe en la URL', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T03:00:00.000Z') }) // 9 de noviembre, 21:00 en Guatemala
    const { fetchMock, router } = montar()
    await screen.findAllByRole('article')
    const url = ultimaConsulta(fetchMock)
    expect(url.searchParams.get('desde')).toBe('2026-11-03')
    expect(url.searchParams.get('hasta')).toBe('2026-11-09')
    expect(router.state.location.search).toBe('')
  })

  it('muestra la fecha en Guatemala, el usuario, la acción traducida, la queja y la dependencia', async () => {
    montar()
    const [asignar] = await screen.findAllByRole('article')
    expect(asignar.querySelector('time')).toHaveAttribute('dateTime', '2026-11-02T21:30:00.000Z')
    expect(asignar.querySelector('time')).toHaveTextContent(/(15:30|3:30)/)
    expect(within(asignar).getByRole('heading', { name: textos.acciones.ticket.asignar })).toBeInTheDocument()
    expect(within(asignar).getByText('Carla Coordinadora')).toBeInTheDocument()
    expect(within(asignar).getByText('Dirección de Obras')).toBeInTheDocument()
    expect(within(asignar).getByRole('link', { name: 'Ver la queja Q-2026-000015' })).toHaveAttribute('href', '/tickets/15')
  })

  it('el sistema aparece como "VozMuni" y una acción global sin dependencia ni enlace', async () => {
    montar()
    const [, escalar, zona] = await screen.findAllByRole('article')
    expect(within(escalar).getByText(textos.registro.sistema)).toBeInTheDocument()
    expect(within(zona).getByText('Zona #9')).toBeInTheDocument()
    expect(within(zona).getByText(textos.registro.sinDependencia)).toBeInTheDocument()
    expect(within(zona).queryByRole('link')).not.toBeInTheDocument()
  })

  it('al expandir un registro se ven la tabla de cambios, los datos y la IP', async () => {
    montar()
    const [asignar] = await screen.findAllByRole('article')
    expect(within(asignar).queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(within(asignar).getByRole('button', { name: textos.registro.verDetalle }))

    const tabla = within(asignar).getByRole('table', { name: textos.registro.cambios })
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      textos.registro.campo,
      textos.registro.antes,
      textos.registro.despues,
    ])
    expect(within(tabla).getByRole('row', { name: 'asignadoA — 9' })).toBeInTheDocument()
    expect(within(asignar).getByText('Cambio de turno')).toBeInTheDocument()
    // Los valores enmascarados se muestran tal cual.
    expect(within(asignar).getByText('****0000')).toBeInTheDocument()
    expect(within(asignar).getByText('IP: 10.0.0.7')).toBeInTheDocument()
  })

  it('los filtros cambian la consulta y la URL', async () => {
    const { fetchMock, router } = montar({ ruta: '/bitacora?desde=2026-11-01&hasta=2026-11-05' })
    await screen.findAllByRole('article')
    expect(ultimaConsulta(fetchMock).searchParams.get('desde')).toBe('2026-11-01')

    fireEvent.change(screen.getByLabelText(textos.filtros.numero), { target: { value: 'q-2026-000015' } })
    await waitFor(() => expect(ultimaConsulta(fetchMock).searchParams.get('numero')).toBe('Q-2026-000015'))
    expect(router.state.location.search).toContain('numero=Q-2026-000015')

    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.filtros.acciones }))
    fireEvent.click(await screen.findByRole('option', { name: textos.acciones.ticket.aceptar }))
    fireEvent.click(screen.getByRole('option', { name: textos.acciones.zona.editar }))
    await waitFor(() =>
      expect(ultimaConsulta(fetchMock).searchParams.getAll('accion')).toEqual(['ticket.aceptar', 'zona.editar']),
    )
    expect(new URLSearchParams(router.state.location.search).getAll('accion')).toEqual(['ticket.aceptar', 'zona.editar'])
  })

  it('un número incompleto no se envía y muestra la ayuda', async () => {
    const { fetchMock } = montar()
    await screen.findAllByRole('article')
    fireEvent.change(screen.getByLabelText(textos.filtros.numero), { target: { value: 'Q-2026' } })
    expect(screen.getByText(textos.filtros.numeroInvalido)).toBeInTheDocument()
    expect(consultas(fetchMock).every((url) => !url.searchParams.has('numero'))).toBe(true)
  })

  it('un clic en un usuario fija el filtro con un chip, y el chip lo quita', async () => {
    const { fetchMock, router } = montar()
    const [asignar] = await screen.findAllByRole('article')
    fireEvent.click(within(asignar).getByRole('button', { name: 'Ver solo los registros de Carla Coordinadora' }))

    await waitFor(() => expect(ultimaConsulta(fetchMock).searchParams.get('usuarioId')).toBe('7'))
    expect(router.state.location.search).toContain('usuarioId=7')
    expect(screen.getByText('Usuario: Carla Coordinadora')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(textos.filtros.quitarUsuario))
    await waitFor(() => expect(router.state.location.search).not.toContain('usuarioId'))
    expect(ultimaConsulta(fetchMock).searchParams.has('usuarioId')).toBe(false)
  })

  it('un rango de más de 92 días avisa y no consulta', async () => {
    const { fetchMock } = montar({ ruta: '/bitacora?desde=2026-08-01&hasta=2026-11-01' })
    expect(await screen.findByRole('alert')).toHaveTextContent('El rango no puede pasar de 92 días')
    expect(consultas(fetchMock)).toHaveLength(0)
  })

  it('"Ver más" pide la página siguiente con el cursor', async () => {
    const { fetchMock } = montar({
      paginas: {
        primera: { datos: [registro(1)], siguienteCursor: 'cursor-1' },
        'cursor-1': { datos: [ZONA], siguienteCursor: null },
      },
    })
    expect(await screen.findAllByRole('article')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: textos.verMas }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(ultimaConsulta(fetchMock).searchParams.get('cursor')).toBe('cursor-1')
    expect(screen.queryByRole('button', { name: textos.verMas })).not.toBeInTheDocument()
  })

  it('las acciones de SPEC 42 aparecen traducidas en el filtro y en la lista, con el motivo y la marca del comentario', async () => {
    const fallo = registro(10, {
      accion: 'sesion.fallar',
      entidad: 'usuario',
      entidadId: '7',
      ticketNumero: null,
      dependencia: null,
      detalle: { datos: { motivo: 'password_incorrecta', intentos: 2 } },
    })
    const nota = registro(11, {
      accion: 'comentario.crear',
      entidad: 'comentario',
      entidadId: '300',
      ticketNumero: 'Q-2026-000015',
      detalle: { datos: { ticketId: 15, interno: true, cuerpo: 'Revisado' } },
    })
    montar({ paginas: { primera: { datos: [fallo, nota], siguienteCursor: null } } })

    const [tarjetaFallo, tarjetaNota] = await screen.findAllByRole('article')
    expect(within(tarjetaFallo).getByRole('heading', { name: textos.acciones.sesion.fallar })).toBeInTheDocument()
    expect(within(tarjetaFallo).getByText(`Motivo: ${textos.motivosFallo.password_incorrecta}`)).toBeInTheDocument()

    expect(within(tarjetaNota).getByRole('heading', { name: textos.acciones.comentario.crear })).toBeInTheDocument()
    expect(within(tarjetaNota).getByText(textos.registro.comentarioInterno)).toBeInTheDocument()
    // El enlace va a la queja del comentario, no al id del comentario.
    expect(within(tarjetaNota).getByRole('link', { name: 'Ver la queja Q-2026-000015' })).toHaveAttribute('href', '/tickets/15')

    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.filtros.acciones }))
    expect(await screen.findByRole('option', { name: textos.acciones.sesion.fallar })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: textos.acciones.comentario.crear })).toBeInTheDocument()
  })

  it('sin registros muestra "No hay registros para estos filtros"', async () => {
    montar({ paginas: { primera: { datos: [], siguienteCursor: null } } })
    expect(await screen.findByText(textos.vacia)).toBeInTheDocument()
  })
})
