import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SlaDto, TicketDetalle } from '../../../src/features/tickets/api/tickets-api'
import { DetalleQueja } from '../../../src/features/tickets/mis-quejas/DetalleQueja'
import { IndicadorSla } from '../../../src/features/tickets/sla/IndicadorSla'
import tickets from '../../../src/locales/es/tickets.json'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from './api-simulada'

const { sla: textos } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

// Martes 3 de noviembre de 2026 a las 12:00 en Guatemala (UTC−6).
const AHORA = new Date('2026-11-03T18:00:00.000Z')
const ANTES = '2026-11-03T15:00:00.000Z' // 09:00 en Guatemala, ya pasó
const DESPUES = '2026-11-10T15:00:00.000Z' // 09:00 del martes siguiente

function sla(cambios: Partial<SlaDto> = {}): SlaDto {
  return {
    venceRespuesta: DESPUES,
    primeraRespuestaEn: null,
    venceResolucion: DESPUES,
    pausado: false,
    restanteMinutosEnPausa: null,
    escalado: false,
    escaladoEn: null,
    escaladoPor: null,
    ...cambios,
  }
}

const montar = (valor: SlaDto | null, estado = 'asignada') =>
  render(<IndicadorSla sla={valor} estado={estado} ahora={AHORA} />)

describe('IndicadorSla', () => {
  it('sin primera respuesta y en plazo: "Responder antes de <fecha>" en hora de Guatemala', () => {
    montar(sla())
    expect(screen.getByText(/^Responder antes de .*9:00/)).toBeInTheDocument()
    expect(screen.getByText(/^Resolver antes de .*9:00/)).toBeInTheDocument()
  })

  it('con la hora actual simulada después del vencimiento: "Respuesta vencida" y "Resolución vencida"', () => {
    montar(sla({ venceRespuesta: ANTES, venceResolucion: ANTES }))
    const respuestaVencida = screen.getByText(textos.respuestaVencida)
    expect(respuestaVencida).toBeInTheDocument()
    expect(respuestaVencida).toHaveAttribute('title', expect.stringMatching(/^Vencía el /))
    expect(screen.getByText(textos.resolucionVencida)).toBeInTheDocument()
  })

  it('la misma queja no está vencida un minuto antes', () => {
    render(<IndicadorSla sla={sla({ venceRespuesta: ANTES })} estado="asignada" ahora={new Date('2026-11-03T14:59:00.000Z')} />)
    expect(screen.queryByText(textos.respuestaVencida)).not.toBeInTheDocument()
  })

  it('con primera respuesta a tiempo: "Respondida"', () => {
    montar(sla({ venceRespuesta: ANTES, primeraRespuestaEn: '2026-11-03T14:00:00.000Z' }), 'en_proceso')
    expect(screen.getByText(textos.respondida)).toBeInTheDocument()
  })

  it('con primera respuesta tarde: "Respondida, fuera de plazo"', () => {
    montar(sla({ venceRespuesta: ANTES, primeraRespuestaEn: '2026-11-03T16:00:00.000Z' }), 'en_proceso')
    expect(screen.getByText(textos.respondidaFueraDePlazo)).toBeInTheDocument()
  })

  it('en pausa muestra el restante en horas y minutos hábiles', () => {
    montar(
      sla({ primeraRespuestaEn: ANTES, venceResolucion: null, pausado: true, restanteMinutosEnPausa: 2345 }),
      'en_espera',
    )
    expect(screen.getByText('En pausa: quedan 39 h 5 min hábiles')).toBeInTheDocument()
    expect(screen.queryByText(/Resolver antes/)).not.toBeInTheDocument()
  })

  it.each(['resuelta', 'cerrada', 'rechazada'])('en %s no muestra la resolución', (estado) => {
    montar(sla({ primeraRespuestaEn: ANTES, venceResolucion: ANTES }), estado)
    expect(screen.queryByText(textos.resolucionVencida)).not.toBeInTheDocument()
    expect(screen.getByText(textos.respondida)).toBeInTheDocument()
  })

  it('escalada muestra la marca textual "Escalada" con ícono, con el plazo y la fecha en el título (SPEC 32)', () => {
    montar(sla({ escalado: true, escaladoEn: ANTES, escaladoPor: 'respuesta' }))
    const marca = screen.getByText(textos.escalada)
    expect(marca).toBeVisible()
    expect(marca.querySelector('svg')).not.toBeNull()
    expect(marca).toHaveAttribute('title', expect.stringMatching(/^Escalada por respuesta el .*9:00/))
  })

  it('sin escalar no muestra la marca', () => {
    montar(sla())
    expect(screen.queryByText(textos.escalada)).not.toBeInTheDocument()
  })

  it('sin datos (sin aceptar o anterior a SPEC 30) no muestra nada', () => {
    const { container } = montar(sla({ venceRespuesta: null, venceResolucion: null }))
    expect(container).toBeEmptyDOMElement()
  })

  it('con sla null (el vecino) no muestra nada', () => {
    const { container } = montar(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('lo vencido lleva texto e ícono, no solo color', () => {
    montar(sla({ venceRespuesta: ANTES }))
    const linea = screen.getByText(textos.respuestaVencida)
    expect(linea.querySelector('svg')).not.toBeNull()
  })
})

describe('IndicadorSla en el detalle', () => {
  const QUEJA: TicketDetalle = {
    id: 5,
    numero: 'Q-2026-000005',
    estado: 'asignada',
    titulo: 'Fuga de agua en la banqueta',
    descripcion: 'El agua sale desde ayer',
    categoria: { id: 2, nombre: 'Agua potable' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20',
    dependencia: { id: 4, nombre: 'Aguas Municipales' },
    creadoEn: '2026-10-20T15:00:00.000Z',
    resueltoEn: null,
    cerradoEn: null,
    informacionSolicitada: null,
    esSolicitante: false,
    resolucion: null,
    confirmacion: null,
    sla: null,
  }

  function montarDetalle(ticket: TicketDetalle, rol: 'vecino' | 'coordinador') {
    simularApi({
      'GET /tickets/5': () => respuesta(200, ticket),
      'GET /tickets/5/comentarios': () => respuesta(200, { datos: [] }),
      'GET /tickets/5/adjuntos': () => respuesta(200, { datos: [] }),
      'GET /tickets/5/linea-tiempo': () => respuesta(200, { datos: [], siguienteCursor: null }),
    })
    renderConConsultas(
      <SessionProvider session={{ usuarioId: 7, nombre: 'Usuario', rol, dependenciaId: null }}>
        <DetalleQueja ticketId={5} />
      </SessionProvider>,
    )
  }

  it('los internos lo ven bajo el título', async () => {
    montarDetalle({ ...QUEJA, sla: sla({ venceRespuesta: '2099-01-01T15:00:00.000Z' }) }, 'coordinador')
    expect(await screen.findByRole('group', { name: textos.titulo })).toHaveTextContent(/Responder antes de/)
  })

  it('el vecino no lo ve', async () => {
    montarDetalle({ ...QUEJA, esSolicitante: true }, 'vecino')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('group', { name: textos.titulo })).not.toBeInTheDocument()
  })
})
