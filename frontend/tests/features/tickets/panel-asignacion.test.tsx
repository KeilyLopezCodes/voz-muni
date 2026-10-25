import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketPorAsignar } from '../../../src/features/tickets/api/asignacion-api'
import { PanelAsignacion } from '../../../src/features/tickets/asignacion/PanelAsignacion'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'
import { porAsignar } from './asignacion-datos'

const { asignacion } = tickets
const { panel } = asignacion

const TECNICOS = [
  { id: 10, nombre: 'Ana Técnica', carga: 0 },
  { id: 9, nombre: 'Luis Técnico', carga: 1 },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(ticket: TicketPorAsignar, asignar: Manejador = () => respuesta(200, {}), tecnicos: Manejador = () => respuesta(200, TECNICOS)) {
  const fetchMock = simularApi({
    'GET /dependencias/4/tecnicos': tecnicos,
    [`PATCH /tickets/${ticket.id}/asignacion`]: asignar,
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  const onTerminar = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PanelAsignacion ticket={ticket} onCerrar={vi.fn()} onTerminar={onTerminar} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { fetchMock, invalidar, onTerminar }
}

function cuerpoAsignacion(fetchMock: ReturnType<typeof simularApi>): unknown {
  const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
  return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
}

const llamadasTecnicos = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls.filter(([entrada]) => String(entrada).endsWith('/dependencias/4/tecnicos')).length

describe('PanelAsignacion', () => {
  it('lista los técnicos con su carga y marca el actual, que no se puede elegir', async () => {
    montar(porAsignar({ tecnico: { id: 9, nombre: 'Luis Técnico' } }))

    expect(await screen.findByRole('radio', { name: 'Ana Técnica · 0 abiertas' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: `Luis Técnico · 1 abierta · ${panel.actual}` })).toBeDisabled()
  })

  it('sin técnico previo, el botón dice "Asignar", no pide motivo y exige elegir técnico', async () => {
    const { fetchMock, invalidar, onTerminar } = montar(porAsignar())
    await screen.findByRole('radio', { name: /Ana Técnica/ })

    expect(screen.queryByRole('textbox', { name: new RegExp(panel.motivo) })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: panel.asignar }))
    expect(await screen.findByText(panel.tecnicoRequerido)).toBeInTheDocument()
    expect(cuerpoAsignacion(fetchMock)).toBeUndefined()

    fireEvent.click(screen.getByRole('radio', { name: /Ana Técnica/ }))
    fireEvent.click(screen.getByRole('button', { name: panel.asignar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith('Asignada a Ana Técnica'))
    expect(cuerpoAsignacion(fetchMock)).toEqual({ tecnicoId: 10 })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'por-asignar'] })
  })

  it('con técnico, el botón dice "Reasignar" y exige motivo', async () => {
    const { fetchMock, onTerminar } = montar(porAsignar({ tecnico: { id: 9, nombre: 'Luis Técnico' } }))
    fireEvent.click(await screen.findByRole('radio', { name: /Ana Técnica/ }))

    fireEvent.click(screen.getByRole('button', { name: panel.reasignar }))
    expect(await screen.findByText(panel.motivoRequerido)).toBeInTheDocument()
    expect(cuerpoAsignacion(fetchMock)).toBeUndefined()

    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(panel.motivo) }), {
      target: { value: 'Luis está de vacaciones' },
    })
    fireEvent.click(screen.getByRole('button', { name: panel.reasignar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith('Asignada a Ana Técnica'))
    expect(cuerpoAsignacion(fetchMock)).toEqual({ tecnicoId: 10, motivo: 'Luis está de vacaciones' })
  })

  it('TECNICO_NO_ELEGIBLE muestra el aviso y recarga la lista de técnicos', async () => {
    const { fetchMock, onTerminar } = montar(porAsignar(), () =>
      respuesta(400, { codigo: 'TECNICO_NO_ELEGIBLE', mensaje: 'x' }),
    )
    fireEvent.click(await screen.findByRole('radio', { name: /Ana Técnica/ }))

    fireEvent.click(screen.getByRole('button', { name: panel.asignar }))

    expect(await screen.findByText(asignacion.errores.TECNICO_NO_ELEGIBLE)).toBeInTheDocument()
    await waitFor(() => expect(llamadasTecnicos(fetchMock)).toBe(2))
    expect(onTerminar).not.toHaveBeenCalled()
  })

  it('OPERACION_NO_PERMITIDA avisa que la queja cambió de estado y recarga la bandeja', async () => {
    const { invalidar, onTerminar } = montar(porAsignar(), () =>
      respuesta(400, { codigo: 'OPERACION_NO_PERMITIDA', mensaje: 'x' }),
    )
    fireEvent.click(await screen.findByRole('radio', { name: /Ana Técnica/ }))

    fireEvent.click(screen.getByRole('button', { name: panel.asignar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(asignacion.avisos.cambioEstado))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'por-asignar'] })
  })

  it('una dependencia sin técnicos muestra el aviso y deshabilita el botón', async () => {
    montar(porAsignar(), undefined, () => respuesta(200, []))

    expect(await screen.findByText(panel.sinTecnicos)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: panel.asignar })).toBeDisabled()
  })
})

// Traslado desde el panel de asignación (SPEC 21).
describe('PanelAsignacion: traslado', () => {
  const { traslados } = tickets
  const DEPENDENCIAS = [
    { id: 5, nombre: 'Agua Potable' },
    { id: 4, nombre: 'Dirección de Obras' },
  ]

  function montarConRol(rol: Rol, traslado: Manejador = () => respuesta(201, {})) {
    const ticket = porAsignar()
    const fetchMock = simularApi({
      'GET /dependencias/4/tecnicos': () => respuesta(200, TECNICOS),
      'GET /dependencias': () => respuesta(200, DEPENDENCIAS),
      [`POST /tickets/${ticket.id}/traslados`]: traslado,
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
    const onTerminar = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={{ usuarioId: 1, nombre: 'Usuario Prueba', rol, dependenciaId: rol === 'coordinador' ? 4 : null }}>
          <MemoryRouter>
            <PanelAsignacion ticket={ticket} onCerrar={vi.fn()} onTerminar={onTerminar} />
          </MemoryRouter>
        </SessionProvider>
      </QueryClientProvider>,
    )
    return { fetchMock, invalidar, onTerminar }
  }

  const cuerpoTraslado = (fetchMock: ReturnType<typeof simularApi>) => {
    const llamada = fetchMock.mock.calls.find(([entrada, init]) => init?.method === 'POST' && String(entrada).endsWith('/traslados'))
    return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
  }

  it('el coordinador envía motivo y sugerencia, y la lista de dependencias no incluye la actual', async () => {
    const { fetchMock, invalidar, onTerminar } = montarConRol('coordinador')
    fireEvent.click(screen.getByRole('button', { name: traslados.panel.solicitar }))

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: new RegExp(traslados.panel.sugerida.replace(/[()]/g, '.')) }))
    await within(screen.getByRole('listbox')).findByRole('option', { name: 'Agua Potable' })
    const opciones = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual([traslados.panel.ninguna, 'Agua Potable'])
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Agua Potable' }))

    fireEvent.click(screen.getByRole('button', { name: traslados.panel.enviar }))
    expect(await screen.findByText(traslados.panel.motivoRequerido)).toBeInTheDocument()
    expect(cuerpoTraslado(fetchMock)).toBeUndefined()

    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(traslados.panel.motivo) }), {
      target: { value: 'Es una fuga de agua' },
    })
    fireEvent.click(screen.getByRole('button', { name: traslados.panel.enviar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(traslados.panel.solicitada))
    expect(cuerpoTraslado(fetchMock)).toEqual({ motivo: 'Es una fuga de agua', dependenciaSugeridaId: 5 })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'por-asignar'] })
  })

  it('el supervisor ve "Trasladar" y pide confirmación antes de enviar', async () => {
    const { fetchMock, onTerminar } = montarConRol('supervisor', () =>
      respuesta(200, { solicitud: {}, ticket: { id: 1, numero: 'Q-2026-000001', estado: 'en_revision' } }),
    )
    fireEvent.click(screen.getByRole('button', { name: traslados.panel.trasladar }))
    fireEvent.change(await screen.findByRole('textbox', { name: new RegExp(traslados.panel.motivo) }), {
      target: { value: 'Corresponde a Agua' },
    })

    fireEvent.click(within(screen.getByRole('form', { name: traslados.panel.trasladar })).getByRole('button', { name: traslados.panel.trasladar }))
    const dialogo = await screen.findByRole('dialog', { name: traslados.panel.confirmarTitulo })
    expect(cuerpoTraslado(fetchMock)).toBeUndefined()
    fireEvent.click(within(dialogo).getByRole('button', { name: traslados.panel.confirmar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(traslados.panel.trasladada))
    expect(cuerpoTraslado(fetchMock)).toEqual({ motivo: 'Corresponde a Agua' })
  })

  it('TRASLADO_PENDIENTE muestra "Ya hay una solicitud pendiente" sin cerrar el panel', async () => {
    const { onTerminar } = montarConRol('coordinador', () => respuesta(409, { codigo: 'TRASLADO_PENDIENTE', mensaje: 'x' }))
    fireEvent.click(screen.getByRole('button', { name: traslados.panel.solicitar }))
    fireEvent.change(await screen.findByRole('textbox', { name: new RegExp(traslados.panel.motivo) }), {
      target: { value: 'Otra vez' },
    })

    fireEvent.click(screen.getByRole('button', { name: traslados.panel.enviar }))

    expect(await screen.findByText(traslados.panel.pendiente)).toBeInTheDocument()
    expect(onTerminar).not.toHaveBeenCalled()
  })
})

describe('PanelAsignacion: enlace al detalle (SPEC 28)', () => {
  it('"Ver detalle completo" lleva a /tickets/:id', () => {
    const ticket = porAsignar()
    montar(ticket)
    expect(screen.getByRole('link', { name: tickets.lineaTiempo.detalleCompleto })).toHaveAttribute('href', `/tickets/${ticket.id}`)
  })
})
