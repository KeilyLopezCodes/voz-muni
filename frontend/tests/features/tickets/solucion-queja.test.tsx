import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfirmacionDetalle, ResolucionDetalle } from '../../../src/features/tickets/api/tickets-api'
import { SolucionQueja } from '../../../src/features/tickets/mis-quejas/SolucionQueja'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { solucion: textos, confirmacion: conf } = tickets.detalle

afterEach(() => {
  vi.unstubAllGlobals()
})

function resolucion(cambios: Partial<ResolucionDetalle> = {}): ResolucionDetalle {
  return {
    descripcion: 'Se rellenó el bache con asfalto.\nSe señalizó la zona.',
    // 00:30 UTC del 24 es todavía el 23 en Guatemala (UTC-6).
    resueltaEn: '2026-10-24T00:30:00.000Z',
    resueltaPor: { id: 3, nombre: 'Técnico de desarrollo' },
    ...cambios,
  }
}

function confirmacion(cambios: Partial<ConfirmacionDetalle> = {}): ConfirmacionDetalle {
  return {
    // 05:59:59.999 UTC del 31 es el viernes 30 a las 23:59 en Guatemala.
    venceEn: '2026-10-31T05:59:59.999Z',
    vencida: false,
    reaperturasRestantes: 2,
    puedeConfirmar: true,
    puedeReabrir: true,
    exigeMotivoAlConfirmar: false,
    ...cambios,
  }
}

interface Montaje {
  res?: ResolucionDetalle
  conf?: ConfirmacionDetalle | null
  esSolicitante?: boolean
  rutas?: Record<string, Manejador>
  cierre?: { automatico: boolean; cerradoEn: string } | null
}

function montar({ res = resolucion(), conf: c = null, esSolicitante = true, rutas = {}, cierre = null }: Montaje = {}) {
  const fetchMock = simularApi(rutas)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  const onHecho = vi.fn()
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SolucionQueja
          ticketId={5}
          resolucion={res}
          confirmacion={c}
          esSolicitante={esSolicitante}
          onHecho={onHecho}
          cierre={cierre}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { fetchMock, invalidar, onHecho, seccion: screen.getByRole('region', { name: textos.titulo }) }
}

const cuerpoEnviado = (fetchMock: ReturnType<typeof simularApi>) => {
  const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
}

const hecha = (estado: string) =>
  respuesta(200, { id: 5, numero: 'Q-2026-000005', estado, asignadoA: 3, resueltoEn: null, cerradoEn: null, reaperturas: 1 })

describe('SolucionQueja', () => {
  describe('resolución (SPEC 26)', () => {
    it('es una sección con el título "Solución" y muestra la descripción con sus saltos de línea', () => {
      const { seccion } = montar()

      const descripcion = screen.getByText(/Se rellenó el bache con asfalto\./)
      expect(seccion).toContainElement(descripcion)
      expect(descripcion.textContent).toBe('Se rellenó el bache con asfalto.\nSe señalizó la zona.')
      expect(descripcion).toHaveStyle({ whiteSpace: 'pre-wrap' })
    })

    it('muestra la fecha en America/Guatemala y "por <nombre>" si hay resueltaPor', () => {
      montar()

      const fecha = screen.getByText(/^Resuelta el /)
      expect(fecha).toHaveTextContent('23 oct 2026')
      expect(fecha).toHaveAttribute('dateTime', '2026-10-24T00:30:00.000Z')
      expect(screen.getByText(/por Técnico de desarrollo/)).toBeInTheDocument()
    })

    it('sin resueltaPor no muestra "por"', () => {
      const { seccion } = montar({ res: resolucion({ resueltaPor: null }) })

      expect(seccion).not.toHaveTextContent(/\bpor\b/)
    })

    it('una descripción con <b> se muestra como texto, sin interpretarse', () => {
      const { seccion } = montar({ res: resolucion({ descripcion: '<b>Listo</b> <img src=x onerror=alert(1)>' }) })

      expect(screen.getByText('<b>Listo</b> <img src=x onerror=alert(1)>')).toBeInTheDocument()
      expect(seccion.querySelector('b')).toBeNull()
      expect(seccion.querySelector('img')).toBeNull()
    })
  })

  describe('confirmación (SPEC 27)', () => {
    it('sin confirmacion no hay plazo ni botones', () => {
      const { seccion } = montar()

      expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
      expect(seccion).not.toHaveTextContent('Tienes hasta')
    })

    it('el vecino ve el plazo en Guatemala y los dos botones', () => {
      const { seccion } = montar({ conf: confirmacion() })

      const plazo = within(seccion).getByText(/^Tienes hasta el /)
      expect(plazo).toHaveTextContent('30 oct 2026')
      expect(plazo).toHaveAttribute('dateTime', '2026-10-31T05:59:59.999Z')
      expect(within(seccion).getByRole('button', { name: conf.confirmar })).toBeInTheDocument()
      expect(within(seccion).getByRole('button', { name: conf.reabrir })).toBeInTheDocument()
    })

    it('un interno sin permiso (el técnico) ve el plazo del vecino sin botones', () => {
      const { seccion } = montar({
        esSolicitante: false,
        conf: confirmacion({ puedeConfirmar: false, puedeReabrir: false, exigeMotivoAlConfirmar: true }),
      })

      expect(within(seccion).getByText(/^El vecino tiene hasta el /)).toBeInTheDocument()
      expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
    })

    it('con el plazo vencido no hay botones', () => {
      const { seccion } = montar({ conf: confirmacion({ vencida: true, puedeConfirmar: false, puedeReabrir: false }) })

      expect(seccion).toHaveTextContent(conf.vencido)
      expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
    })

    it('en el límite de reaperturas, el vecino ve el aviso con el enlace a /tickets/nueva y solo "Confirmar"', () => {
      const { seccion } = montar({ conf: confirmacion({ reaperturasRestantes: 0, puedeReabrir: false }) })

      expect(seccion).toHaveTextContent(conf.limite)
      expect(within(seccion).getByRole('link', { name: conf.registrarNueva })).toHaveAttribute('href', '/tickets/nueva')
      expect(within(seccion).queryByRole('button', { name: conf.reabrir })).not.toBeInTheDocument()
      expect(within(seccion).getByRole('button', { name: conf.confirmar })).toBeInTheDocument()
    })

    it('el vecino confirma sin motivo: envía solo la acción, avisa e invalida el detalle y "Mis quejas"', async () => {
      const { fetchMock, invalidar, onHecho } = montar({
        conf: confirmacion(),
        rutas: { 'POST /tickets/5/transiciones': () => hecha('cerrada') },
      })

      fireEvent.click(screen.getByRole('button', { name: conf.confirmar }))
      const dialogo = await screen.findByRole('dialog', { name: conf.dialogoConfirmar.titulo })
      expect(within(dialogo).queryByRole('textbox')).not.toBeInTheDocument()
      fireEvent.click(within(dialogo).getByRole('button', { name: conf.dialogoConfirmar.aceptar }))

      await waitFor(() => expect(onHecho).toHaveBeenCalledWith(conf.cerrada))
      expect(cuerpoEnviado(fetchMock)).toEqual({ accion: 'confirmar' })
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'detalle', 5] })
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'listado'] })
    })

    it('el coordinador debe escribir cómo confirmó el vecino', async () => {
      const { fetchMock, onHecho } = montar({
        esSolicitante: false,
        conf: confirmacion({ exigeMotivoAlConfirmar: true }),
        rutas: { 'POST /tickets/5/transiciones': () => hecha('cerrada') },
      })

      fireEvent.click(screen.getByRole('button', { name: conf.confirmar }))
      const dialogo = await screen.findByRole('dialog')
      const aceptar = within(dialogo).getByRole('button', { name: conf.dialogoConfirmar.aceptar })
      expect(aceptar).toBeDisabled()
      fireEvent.change(within(dialogo).getByRole('textbox', { name: new RegExp(conf.dialogoConfirmar.motivo.replace('?', '\\?')) }), {
        target: { value: 'Por teléfono' },
      })
      fireEvent.click(aceptar)

      await waitFor(() => expect(onHecho).toHaveBeenCalled())
      expect(cuerpoEnviado(fetchMock)).toEqual({ accion: 'confirmar', motivo: 'Por teléfono' })
    })

    it('reabrir exige motivo, muestra cuántas reaperturas quedan y avisa al terminar', async () => {
      const { fetchMock, onHecho } = montar({
        conf: confirmacion({ reaperturasRestantes: 1 }),
        rutas: { 'POST /tickets/5/transiciones': () => hecha('en_proceso') },
      })

      fireEvent.click(screen.getByRole('button', { name: conf.reabrir }))
      const dialogo = await screen.findByRole('dialog', { name: conf.dialogoReabrir.titulo })
      expect(dialogo).toHaveTextContent('Puedes reabrirla 1 vez más.')
      const aceptar = within(dialogo).getByRole('button', { name: conf.dialogoReabrir.aceptar })
      expect(aceptar).toBeDisabled()
      fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Sigue saliendo agua' } })
      fireEvent.click(aceptar)

      await waitFor(() => expect(onHecho).toHaveBeenCalledWith(conf.reabierta))
      expect(cuerpoEnviado(fetchMock)).toEqual({ accion: 'reabrir', motivo: 'Sigue saliendo agua' })
    })

    it('un 409 cierra el diálogo, muestra que la queja cambió y recarga', async () => {
      const { invalidar, onHecho } = montar({
        conf: confirmacion(),
        rutas: {
          'POST /tickets/5/transiciones': () => respuesta(409, { codigo: 'PLAZO_CONFIRMACION_VENCIDO', mensaje: 'x' }),
        },
      })

      fireEvent.click(screen.getByRole('button', { name: conf.confirmar }))
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: conf.dialogoConfirmar.aceptar }))

      expect(await screen.findByText(conf.cambio)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'detalle', 5] })
      expect(onHecho).not.toHaveBeenCalled()
    })
  })
})

describe('SolucionQueja: cómo terminó (SPEC 33)', () => {
  const { cierre: textosCierre } = tickets.detalle
  // 00:30 UTC del 26 es todavía el 25 a las 18:30 en Guatemala.
  const CERRADO_EN = '2026-10-26T00:30:00.000Z'

  it('con cierre automático muestra "Cerrada automáticamente…" con la fecha en Guatemala, sin botones', () => {
    const { seccion } = montar({ cierre: { automatico: true, cerradoEn: CERRADO_EN } })
    expect(within(seccion).getByText(textosCierre.automatica, { exact: false })).toBeInTheDocument()
    const fecha = seccion.querySelector(`time[datetime="${CERRADO_EN}"]`)!
    expect(fecha.textContent).toMatch(/^el 25 oct 2026.*(18:30|6:30)/)
    expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
    expect(within(seccion).queryByText(textosCierre.confirmada, { exact: false })).not.toBeInTheDocument()
  })

  it('cerrada sin cierre automático muestra "Solución confirmada", sin botones', () => {
    const { seccion } = montar({ cierre: { automatico: false, cerradoEn: CERRADO_EN } })
    expect(within(seccion).getByText(textosCierre.confirmada, { exact: false })).toBeInTheDocument()
    expect(within(seccion).queryByText(textosCierre.automatica, { exact: false })).not.toBeInTheDocument()
    expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sin cierre (resuelta) no muestra ninguno de los dos textos', () => {
    const { seccion } = montar({ conf: confirmacion() })
    expect(within(seccion).queryByText(textosCierre.automatica, { exact: false })).not.toBeInTheDocument()
    expect(within(seccion).queryByText(textosCierre.confirmada, { exact: false })).not.toBeInTheDocument()
  })
})
