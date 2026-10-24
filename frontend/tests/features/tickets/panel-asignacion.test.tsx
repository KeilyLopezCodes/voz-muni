import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketPorAsignar } from '../../../src/features/tickets/api/asignacion-api'
import { PanelAsignacion } from '../../../src/features/tickets/asignacion/PanelAsignacion'
import tickets from '../../../src/locales/es/tickets.json'
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
      <PanelAsignacion ticket={ticket} onCerrar={vi.fn()} onTerminar={onTerminar} />
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
