import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketAtencion } from '../../../src/features/tickets/api/atencion-api'
import { PanelAtencion } from '../../../src/features/tickets/atencion/PanelAtencion'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'
import { enAtencion } from './atencion-datos'

const { atencion, traslados } = tickets
const { acciones } = atencion

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(ticket: TicketAtencion, transicion: Manejador = () => respuesta(200, {}), rol: Rol = 'tecnico') {
  const fetchMock = simularApi({ [`POST /tickets/${ticket.id}/transiciones`]: transicion })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  const onTerminar = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={{ usuarioId: 30, nombre: 'Usuario Prueba', rol, dependenciaId: 4 }}>
        <MemoryRouter>
          <PanelAtencion ticket={ticket} onCerrar={vi.fn()} onTerminar={onTerminar} />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { fetchMock, invalidar, onTerminar }
}

function cuerpoTransicion(fetchMock: ReturnType<typeof simularApi>): unknown {
  const llamada = fetchMock.mock.calls.find(([entrada, init]) => init?.method === 'POST' && String(entrada).endsWith('/transiciones'))
  return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
}

const boton = (nombre: string) => screen.queryByRole('button', { name: nombre })

describe('PanelAtencion', () => {
  it('muestra la descripción, la dirección y los datos adicionales', () => {
    montar(enAtencion())

    expect(screen.getByText('Hay un bache profundo que daña los vehículos')).toBeInTheDocument()
    expect(screen.getByText('5a avenida 3-20')).toBeInTheDocument()
    expect(screen.getByText('profundidad_cm')).toBeInTheDocument()
    expect(screen.getByText(atencion.panel.no)).toBeInTheDocument()
  })

  it.each<[TicketAtencion['estado'], string[], string[]]>([
    ['asignada', [acciones.iniciar], [acciones.reanudar, acciones.resolver, acciones.confirmarEspera]],
    ['en_proceso', [acciones.confirmarEspera, acciones.resolver], [acciones.iniciar, acciones.reanudar]],
    ['en_espera', [acciones.reanudar], [acciones.iniciar, acciones.resolver, acciones.confirmarEspera]],
  ])('en %s muestra solo sus acciones', (estado, visibles, ocultas) => {
    montar(enAtencion({ estado }))

    for (const nombre of visibles) expect(boton(nombre)).toBeInTheDocument()
    for (const nombre of ocultas) expect(boton(nombre)).not.toBeInTheDocument()
  })

  it('"Iniciar" sin técnico está deshabilitado y avisa', () => {
    montar(enAtencion({ tecnico: null }), undefined, 'coordinador')

    expect(boton(acciones.iniciar)).toBeDisabled()
    expect(screen.getByText(acciones.sinTecnico)).toBeInTheDocument()
  })

  it('iniciar envía la acción, invalida la bandeja y avisa', async () => {
    const { fetchMock, invalidar, onTerminar } = montar(enAtencion())

    fireEvent.click(boton(acciones.iniciar)!)

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(atencion.avisos.iniciada))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'iniciar' })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'atencion'] })
  })

  it('"Poner en espera" exige motivo y lo envía', async () => {
    const { fetchMock, onTerminar } = montar(enAtencion({ estado: 'en_proceso' }))

    fireEvent.click(boton(acciones.confirmarEspera)!)
    expect(await screen.findByText(acciones.motivoRequerido)).toBeInTheDocument()
    expect(cuerpoTransicion(fetchMock)).toBeUndefined()

    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(acciones.motivoEspera.replace('?', '\\?')) }), {
      target: { value: 'Foto del bache' },
    })
    fireEvent.click(boton(acciones.confirmarEspera)!)

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(atencion.avisos.enEspera))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'poner_en_espera', motivo: 'Foto del bache' })
  })

  it('"Resolver" exige descripción y confirmación', async () => {
    const { fetchMock, onTerminar } = montar(enAtencion({ estado: 'en_proceso' }))

    fireEvent.click(boton(acciones.resolver)!)
    expect(await screen.findByText(acciones.descripcionRequerida)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(acciones.descripcion) }), {
      target: { value: 'Se rellenó con asfalto' },
    })
    fireEvent.click(boton(acciones.resolver)!)
    const dialogo = await screen.findByRole('dialog', { name: acciones.confirmarResolverTitulo })
    expect(cuerpoTransicion(fetchMock)).toBeUndefined()
    fireEvent.click(within(dialogo).getByRole('button', { name: acciones.confirmar }))

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(atencion.avisos.resuelta))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'resolver', descripcion: 'Se rellenó con asfalto' })
  })

  it('en espera muestra la información solicitada, y "Reanudar" la envía', async () => {
    const { fetchMock, onTerminar } = montar(enAtencion({ estado: 'en_espera', motivoEspera: 'Falta el número de casa' }))

    expect(screen.getByText('Información solicitada: Falta el número de casa')).toBeInTheDocument()
    fireEvent.click(boton(acciones.reanudar)!)

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(atencion.avisos.reanudada))
    expect(cuerpoTransicion(fetchMock)).toEqual({ accion: 'reanudar' })
  })

  it.each<TicketAtencion['estado']>(['asignada', 'en_proceso'])('en %s aparece "Solicitar traslado"', (estado) => {
    montar(enAtencion({ estado }))

    expect(boton(traslados.panel.solicitar)).toBeInTheDocument()
  })

  it.each<[string, Partial<TicketAtencion>]>([
    ['con un traslado pendiente', { trasladoPendiente: true }],
    ['en espera', { estado: 'en_espera' }],
  ])('"Solicitar traslado" se oculta %s', (_caso, cambios) => {
    montar(enAtencion(cambios))

    expect(boton(traslados.panel.solicitar)).not.toBeInTheDocument()
  })

  it('el supervisor ve "Trasladar"', () => {
    montar(enAtencion(), undefined, 'supervisor')

    expect(boton(traslados.panel.trasladar)).toBeInTheDocument()
  })

  it('un 409 muestra "La queja cambió de estado" y recarga la bandeja', async () => {
    const { invalidar, onTerminar } = montar(enAtencion(), () =>
      respuesta(409, { codigo: 'TRANSICION_INVALIDA', mensaje: 'x' }),
    )

    fireEvent.click(boton(acciones.iniciar)!)

    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith(atencion.avisos.cambioEstado))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'atencion'] })
  })
})

describe('PanelAtencion: enlace al detalle (SPEC 28)', () => {
  it('"Ver detalle completo" lleva a /tickets/:id', () => {
    const ticket = enAtencion()
    montar(ticket)
    expect(screen.getByRole('link', { name: tickets.lineaTiempo.detalleCompleto })).toHaveAttribute('href', `/tickets/${ticket.id}`)
  })
})
