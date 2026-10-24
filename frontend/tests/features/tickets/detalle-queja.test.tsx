import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adjunto } from '../../../src/features/tickets/api/adjuntos-api'
import type { TicketDetalle } from '../../../src/features/tickets/api/tickets-api'
import { DetalleQueja } from '../../../src/features/tickets/mis-quejas/DetalleQueja'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, renderConConsultas, respuesta, simularApi } from './api-simulada'

const { detalle: textos, comentarios, adjuntos, estados } = tickets
const PEDIDO = 'Envíe el número de contador'

afterEach(() => {
  vi.unstubAllGlobals()
})

function queja(cambios: Partial<TicketDetalle> = {}): TicketDetalle {
  return {
    id: 5,
    numero: 'Q-2026-000005',
    estado: 'en_espera',
    titulo: 'Fuga de agua en la banqueta',
    descripcion: 'El agua sale desde ayer',
    categoria: { id: 2, nombre: 'Agua potable' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20',
    dependencia: { id: 4, nombre: 'Aguas Municipales' },
    creadoEn: '2026-10-20T15:00:00.000Z',
    resueltoEn: null,
    cerradoEn: null,
    informacionSolicitada: PEDIDO,
    esSolicitante: true,
    resolucion: null,
    confirmacion: null,
    ...cambios,
  }
}

const ADJUNTO: Adjunto = {
  id: 1,
  nombre: 'foto.jpg',
  mime: 'image/jpeg',
  tamanoBytes: 2048,
  interno: false,
  origen: 'registro',
  subidoPor: { id: 7, nombre: 'Ana López', rol: 'vecino' },
  creadoEn: '2026-10-20T15:00:00.000Z',
  borrable: true, // aunque el backend lo marque, el vecino no borra desde el detalle
}

function montar({
  ticket = queja(),
  rol = 'vecino',
  rutas = {},
}: { ticket?: TicketDetalle; rol?: Rol; rutas?: Record<string, Manejador> } = {}) {
  const fetchMock = simularApi({
    'GET /tickets/5': () => respuesta(200, ticket),
    'GET /tickets/5/comentarios': () => respuesta(200, { datos: [] }),
    'GET /tickets/5/adjuntos': () => respuesta(200, { datos: [ADJUNTO] }),
    ...rutas,
  })
  renderConConsultas(
    <SessionProvider session={{ usuarioId: 7, nombre: 'Ana López', rol, dependenciaId: null }}>
      <DetalleQueja ticketId={5} />
    </SessionProvider>,
  )
  return fetchMock
}

const campo = () => screen.getByRole('textbox', { name: comentarios.campo })

describe('DetalleQueja', () => {
  it('muestra los datos, el estado con su texto y el enlace a "Mis quejas"', async () => {
    montar({ ticket: queja({ estado: 'en_proceso', informacionSolicitada: null }) })

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Fuga de agua en la banqueta')
    expect(screen.getByText('Q-2026-000005')).toBeInTheDocument()
    expect(screen.getByText(estados.en_proceso)).toBeInTheDocument()
    expect(screen.getByText('El agua sale desde ayer')).toBeInTheDocument()
    expect(screen.getByText('Zona 1 · 5a avenida 3-20')).toBeInTheDocument()
    expect(screen.getByText('Aguas Municipales')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: textos.volver })).toHaveAttribute('href', '/tickets')
    expect(screen.queryByText(textos.responder)).not.toBeInTheDocument()
  })

  it('en espera muestra el recuadro con el pedido, y "Responder" lleva el foco a la caja', async () => {
    montar()

    const recuadro = await screen.findByText(textos.informacionSolicitada.replace('{{informacion}}', PEDIDO))
    expect(recuadro.closest('[role="status"]')).not.toBeNull()
    await screen.findByRole('form', { name: comentarios.nuevo })

    fireEvent.click(screen.getByRole('button', { name: textos.responder }))

    expect(campo()).toHaveFocus()
  })

  it('el hilo no ofrece nota interna al vecino', async () => {
    montar()

    await screen.findByRole('form', { name: comentarios.nuevo })
    expect(screen.queryByRole('group', { name: comentarios.visibilidad })).not.toBeInTheDocument()
    expect(screen.queryByText(comentarios.notaInterna)).not.toBeInTheDocument()
  })

  it('enviar la respuesta manda un comentario público, muestra el aviso y recarga el detalle', async () => {
    let estado: TicketDetalle['estado'] = 'en_espera'
    const fetchMock = montar({
      rutas: {
        'GET /tickets/5': () =>
          respuesta(200, queja(estado === 'en_espera' ? {} : { estado, informacionSolicitada: null })),
        'POST /tickets/5/comentarios': () => {
          estado = 'en_proceso'
          return respuesta(201, {
            comentario: {
              id: 9,
              cuerpo: 'El contador es 123456',
              interno: false,
              autor: { id: 7, nombre: 'Ana López', rol: 'vecino' },
              esDelSolicitante: true,
              creadoEn: new Date().toISOString(),
              editadoEn: null,
              editable: true,
            },
            ticket: { id: 5, estado: 'en_proceso' },
          })
        },
      },
    })

    fireEvent.change(await screen.findByRole('textbox', { name: comentarios.campo }), {
      target: { value: 'El contador es 123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: comentarios.enviar }))

    expect(await screen.findByText(textos.respuestaEnviada)).toBeInTheDocument()
    const envio = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(envio?.[1]?.body as string)).toEqual({ cuerpo: 'El contador es 123456', interno: false })
    await waitFor(() => expect(screen.getByText(estados.en_proceso)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: textos.responder })).not.toBeInTheDocument()
    const detalles = fetchMock.mock.calls.filter(
      ([entrada, init]) => (init?.method ?? 'GET') === 'GET' && String(entrada).endsWith('/tickets/5'),
    )
    expect(detalles).toHaveLength(2)
  })

  it.each(['cerrada', 'rechazada'] as const)('en una queja %s no hay caja de respuesta', async (estado) => {
    montar({ ticket: queja({ estado, informacionSolicitada: null }) })

    expect(await screen.findByText(estados[estado])).toBeInTheDocument()
    await screen.findByText(comentarios.vacio)
    expect(screen.queryByRole('form', { name: comentarios.nuevo })).not.toBeInTheDocument()
  })

  it('los adjuntos se pueden descargar, pero no subir ni borrar', async () => {
    montar()

    const articulo = await screen.findByRole('article', { name: 'foto.jpg' })
    expect(within(articulo).getByRole('button', { name: adjuntos.descargar })).toBeInTheDocument()
    expect(within(articulo).getByRole('button', { name: adjuntos.ver })).toBeInTheDocument()
    expect(within(articulo).queryByRole('button', { name: adjuntos.borrar })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: adjuntos.subir })).not.toBeInTheDocument()
  })

  it('un interno ve el hilo en su modo normal, con nota interna', async () => {
    montar({ rol: 'tecnico', ticket: queja({ esSolicitante: false }) })

    const caja = await screen.findByRole('form', { name: comentarios.nuevo })
    expect(within(caja).getByRole('button', { name: comentarios.notaInterna })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: adjuntos.subir })).toBeInTheDocument()
  })

  describe('solución (SPEC 26)', () => {
    const RESOLUCION = {
      descripcion: 'Se reparó la tubería.',
      resueltaEn: '2026-10-23T18:30:00.000Z',
      resueltaPor: null,
    }
    const CONFIRMACION = {
      venceEn: '2026-10-31T05:59:59.999Z',
      vencida: false,
      reaperturasRestantes: 2,
      puedeConfirmar: true,
      puedeReabrir: true,
      exigeMotivoAlConfirmar: false,
    }

    it('sin resolución no hay bloque "Solución"', async () => {
      montar({ ticket: queja({ estado: 'en_proceso', informacionSolicitada: null }) })

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('region', { name: textos.solucion.titulo })).not.toBeInTheDocument()
    })

    it('el vecino en resuelta ve la solución sin quién resolvió, el plazo y los botones (SPEC 27)', async () => {
      montar({
        ticket: queja({ estado: 'resuelta', informacionSolicitada: null, resolucion: RESOLUCION, confirmacion: CONFIRMACION }),
      })

      const seccion = await screen.findByRole('region', { name: textos.solucion.titulo })
      expect(seccion).toHaveTextContent('Se reparó la tubería.')
      expect(seccion).not.toHaveTextContent(/\bpor\b/)
      expect(seccion).toHaveTextContent(/Tienes hasta el /)
      expect(within(seccion).getByRole('button', { name: textos.confirmacion.confirmar })).toBeInTheDocument()
      expect(within(seccion).getByRole('button', { name: textos.confirmacion.reabrir })).toBeInTheDocument()
      // El texto temporal de SPEC 26 ya no existe.
      expect(seccion).not.toHaveTextContent('Pronto podrás')
    })

    it('confirmar desde el detalle muestra "Gracias, cerramos tu queja" y recarga la queja', async () => {
      let estado: TicketDetalle['estado'] = 'resuelta'
      const fetchMock = montar({
        rutas: {
          'GET /tickets/5': () =>
            respuesta(
              200,
              queja({
                estado,
                informacionSolicitada: null,
                resolucion: RESOLUCION,
                confirmacion: estado === 'resuelta' ? CONFIRMACION : null,
              }),
            ),
          'POST /tickets/5/transiciones': () => {
            estado = 'cerrada'
            return respuesta(200, { id: 5, numero: 'Q-2026-000005', estado, asignadoA: 3, resueltoEn: null, cerradoEn: null, reaperturas: 0 })
          },
        },
      })

      fireEvent.click(await screen.findByRole('button', { name: textos.confirmacion.confirmar }))
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: textos.confirmacion.dialogoConfirmar.aceptar }),
      )

      expect(await screen.findByText(textos.confirmacion.cerrada)).toBeInTheDocument()
      await waitFor(() => expect(screen.getByText(estados.cerrada)).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: textos.confirmacion.confirmar })).not.toBeInTheDocument()
      const detalles = fetchMock.mock.calls.filter(
        ([entrada, init]) => (init?.method ?? 'GET') === 'GET' && String(entrada).endsWith('/tickets/5'),
      )
      expect(detalles).toHaveLength(2)
    })

    it('un interno ve quién resolvió y no el aviso del vecino', async () => {
      montar({
        rol: 'coordinador',
        ticket: queja({
          estado: 'resuelta',
          informacionSolicitada: null,
          esSolicitante: false,
          resolucion: { ...RESOLUCION, resueltaPor: { id: 3, nombre: 'Técnico de desarrollo' } },
        }),
      })

      const seccion = await screen.findByRole('region', { name: textos.solucion.titulo })
      expect(seccion).toHaveTextContent('por Técnico de desarrollo')
      expect(seccion).not.toHaveTextContent('Pronto podrás')
    })

    it('en una queja cerrada se ve la solución sin el aviso', async () => {
      montar({ ticket: queja({ estado: 'cerrada', informacionSolicitada: null, resolucion: RESOLUCION }) })

      const seccion = await screen.findByRole('region', { name: textos.solucion.titulo })
      expect(seccion).toHaveTextContent('Se reparó la tubería.')
      expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('un 404 muestra "No encontramos esta queja"', async () => {
    montar({ rutas: { 'GET /tickets/5': () => respuesta(404, { codigo: 'NO_ENCONTRADO', mensaje: 'x' }) } })

    expect(await screen.findByRole('alert')).toHaveTextContent(textos.noEncontrada)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
