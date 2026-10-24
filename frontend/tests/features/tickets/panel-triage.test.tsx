import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketTriage } from '../../../src/features/tickets/api/triage-api'
import { PanelTriage } from '../../../src/features/tickets/triage/PanelTriage'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, rutasCatalogos, simularApi } from './api-simulada'
import { queja } from './triage-datos'

const { triage } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(ticket: TicketTriage, transicion: Manejador = () => respuesta(200, {})) {
  const fetchMock = simularApi({ ...rutasCatalogos(), [`POST /tickets/${ticket.id}/transiciones`]: transicion })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  const onTerminar = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <PanelTriage ticket={ticket} onCerrar={vi.fn()} onTerminar={onTerminar} />
    </QueryClientProvider>,
  )
  return { fetchMock, invalidar, onTerminar }
}

// Cuerpo de la única llamada a POST /transiciones.
function cuerpoTransicion(fetchMock: ReturnType<typeof simularApi>): unknown {
  const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
}

// MUI dibuja el select como un botón con rol combobox; las opciones aparecen en un listbox.
function elegir(etiqueta: string, opcion: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(etiqueta) }))
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: opcion }))
}

describe('PanelTriage', () => {
  it('muestra el detalle: datos adicionales con sus etiquetas, ubicación y solicitante', async () => {
    montar(queja())

    expect(screen.getByText('El poste lleva una semana apagado')).toBeInTheDocument()
    expect(screen.getByText('14.6, -90.5')).toBeInTheDocument()
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(await screen.findByText('Número de poste')).toBeInTheDocument()
    expect(screen.getByText('P-123')).toBeInTheDocument()
    expect(screen.getByText('¿Hay cables expuestos?')).toBeInTheDocument()
    expect(screen.getByText(triage.panel.si)).toBeInTheDocument()
    // Un campo que ya no existe en la categoría se muestra con su clave.
    expect(screen.getByText('campo_viejo')).toBeInTheDocument()
  })

  it('en nueva solo aparece "Tomar", y tomar invalida la bandeja y avisa', async () => {
    const { fetchMock, invalidar, onTerminar } = montar(queja())

    expect(screen.queryByRole('button', { name: triage.acciones.aceptar })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: triage.acciones.rechazar })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.tomar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(triage.avisos.tomada))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'tomar' })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'triage'] })
  })

  it('en en_revision, aceptar exige prioridad, preselecciona la categoría actual y muestra la dependencia', async () => {
    const { fetchMock, onTerminar } = montar(queja({ estado: 'en_revision' }))

    expect(screen.queryByRole('button', { name: triage.acciones.tomar })).not.toBeInTheDocument()
    const categoria = screen.getByRole('combobox', { name: new RegExp(triage.acciones.categoria) })
    expect(categoria).toHaveTextContent('Alumbrado público')
    expect(await screen.findByText('Se enviará a: Servicios Públicos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: triage.acciones.aceptar }))
    expect(await screen.findByText(triage.acciones.prioridadRequerida)).toBeInTheDocument()
    expect(cuerpoTransicion(fetchMock)).toBeUndefined()

    elegir(triage.acciones.prioridad, triage.prioridades.alta)
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.aceptar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith('Aceptada y enviada a Servicios Públicos'))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'aceptar', prioridad: 'alta' })
  })

  it('cambiar la categoría actualiza la dependencia mostrada y envía categoriaId', async () => {
    const { fetchMock, onTerminar } = montar(queja({ estado: 'en_revision' }))
    await screen.findByText('Se enviará a: Servicios Públicos')

    elegir(triage.acciones.categoria, 'Baches')
    expect(screen.getByText('Se enviará a: Dirección de Obras')).toBeInTheDocument()
    elegir(triage.acciones.prioridad, triage.prioridades.media)
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.aceptar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith('Aceptada y enviada a Dirección de Obras'))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'aceptar', prioridad: 'media', categoriaId: 2 })
  })

  it('rechazar exige motivo y pide confirmación antes de enviar', async () => {
    const { fetchMock, onTerminar } = montar(queja({ estado: 'en_revision' }))

    fireEvent.click(screen.getByRole('button', { name: triage.acciones.rechazar }))
    expect(await screen.findByText(triage.acciones.motivoRequerido)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(triage.acciones.motivo) }), {
      target: { value: 'Está fuera del municipio' },
    })
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.rechazar }))
    const dialogo = await screen.findByRole('dialog', { name: triage.acciones.confirmarTitulo })
    expect(cuerpoTransicion(fetchMock)).toBeUndefined()

    fireEvent.click(within(dialogo).getByRole('button', { name: triage.acciones.confirmar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(triage.avisos.rechazada))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'rechazar', motivo: 'Está fuera del municipio' })
  })

  it('cancelar la confirmación no envía nada', async () => {
    const { fetchMock } = montar(queja({ estado: 'en_revision' }))
    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(triage.acciones.motivo) }), {
      target: { value: 'Duplicada' },
    })
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.rechazar }))

    const dialogo = await screen.findByRole('dialog', { name: triage.acciones.confirmarTitulo })
    fireEvent.click(within(dialogo).getByRole('button', { name: triage.acciones.cancelar }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: triage.acciones.confirmarTitulo })).not.toBeInTheDocument(),
    )
    expect(cuerpoTransicion(fetchMock)).toBeUndefined()
  })

  it('un 409 muestra "Otra persona ya actuó sobre esta queja" y recarga la bandeja', async () => {
    const { invalidar, onTerminar } = montar(queja(), () =>
      respuesta(409, { codigo: 'TRANSICION_INVALIDA', mensaje: 'No se permite pasar de en_revision a en_revision' }),
    )

    fireEvent.click(screen.getByRole('button', { name: triage.acciones.tomar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(triage.avisos.conflicto))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'triage'] })
  })

  it('un 400 CATEGORIA_INVALIDA queda en el panel, sin cerrarlo', async () => {
    const { onTerminar } = montar(queja({ estado: 'en_revision' }), () =>
      respuesta(400, { codigo: 'CATEGORIA_INVALIDA', mensaje: 'x' }),
    )
    await screen.findByText('Se enviará a: Servicios Públicos')

    elegir(triage.acciones.prioridad, triage.prioridades.baja)
    fireEvent.click(screen.getByRole('button', { name: triage.acciones.aceptar }))

    expect(await screen.findByText(triage.errores.CATEGORIA_INVALIDA)).toBeInTheDocument()
    expect(onTerminar).not.toHaveBeenCalled()
  })
})

describe('PanelTriage: traslado reciente (SPEC 21)', () => {
  it('muestra de dónde viene, la sugerencia y el motivo del último traslado aprobado', () => {
    montar(
      queja({
        estado: 'en_revision',
        trasladoReciente: { dependenciaOrigen: 'Dirección de Obras', dependenciaSugerida: 'Agua Potable', motivo: 'Es una fuga' },
      }),
    )

    expect(screen.getByText('Trasladada desde Dirección de Obras. Sugerencia: Agua Potable. Motivo: Es una fuga')).toBeInTheDocument()
  })

  it('sin sugerencia dice "ninguna", y sin traslado no muestra nada', () => {
    montar(queja({ estado: 'en_revision', trasladoReciente: { dependenciaOrigen: 'Obras', dependenciaSugerida: null, motivo: 'X' } }))
    expect(screen.getByText('Trasladada desde Obras. Sugerencia: ninguna. Motivo: X')).toBeInTheDocument()
  })
})
