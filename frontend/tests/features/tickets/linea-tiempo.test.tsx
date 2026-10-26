import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventoLineaTiempo, PaginaLineaTiempo } from '../../../src/features/tickets/api/linea-tiempo-api'
import type { TicketDetalle } from '../../../src/features/tickets/api/tickets-api'
import { LineaTiempo } from '../../../src/features/tickets/linea-tiempo/LineaTiempo'
import { DetalleQueja } from '../../../src/features/tickets/mis-quejas/DetalleQueja'
import tickets from '../../../src/locales/es/tickets.json'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, renderConConsultas, respuesta, simularApi } from './api-simulada'

const { lineaTiempo: textos, comentarios } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function cambio(id: number, minuto: number): EventoLineaTiempo {
  return {
    id: `estado:${id}`,
    ocurridoEn: `2026-10-20T15:${String(minuto).padStart(2, '0')}:00.000Z`,
    actor: { tipo: 'municipalidad' },
    detalle: { tipo: 'estado', estadoAnterior: 'nueva', estadoNuevo: 'en_revision', motivo: `Motivo ${id}` },
  }
}

const PRIMERA: PaginaLineaTiempo = { datos: [cambio(3, 30), cambio(2, 20)], siguienteCursor: 'cursor-1' }
const SEGUNDA: PaginaLineaTiempo = { datos: [cambio(1, 10)], siguienteCursor: null }

// GET /tickets/5/linea-tiempo, con o sin cursor.
function rutaLineaTiempo(paginas: Record<string, PaginaLineaTiempo> = { '': PRIMERA, 'cursor-1': SEGUNDA }): Manejador {
  return (url) => respuesta(200, paginas[url.searchParams.get('cursor') ?? ''])
}

function montar(rutas: Record<string, Manejador>) {
  const fetchMock = simularApi(rutas)
  renderConConsultas(<LineaTiempo ticketId={5} />)
  return fetchMock
}

const llamadasLineaTiempo = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls.filter(([entrada]) => String(entrada).includes('/linea-tiempo'))

describe('LineaTiempo', () => {
  it('muestra la primera página con su título', async () => {
    montar({ 'GET /tickets/5/linea-tiempo': rutaLineaTiempo() })
    expect(screen.getByRole('heading', { level: 2, name: textos.titulo })).toBeInTheDocument()
    expect(await screen.findByText('Motivo 3')).toBeInTheDocument()
    expect(screen.getByText('Motivo 2')).toBeInTheDocument()
    expect(screen.queryByText('Motivo 1')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: textos.titulo })).toBeInTheDocument()
  })

  it('"Ver anteriores" pide el siguiente cursor y se oculta cuando no hay más', async () => {
    const fetchMock = montar({ 'GET /tickets/5/linea-tiempo': rutaLineaTiempo() })
    fireEvent.click(await screen.findByRole('button', { name: textos.verAnteriores }))

    expect(await screen.findByText('Motivo 1')).toBeInTheDocument()
    expect(screen.getByText('Motivo 3')).toBeInTheDocument()
    const urls = llamadasLineaTiempo(fetchMock).map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    expect(urls.map((u) => u.searchParams.get('cursor'))).toEqual([null, 'cursor-1'])
    await waitFor(() => expect(screen.queryByRole('button', { name: textos.verAnteriores })).not.toBeInTheDocument())
  })

  it('sin siguienteCursor no muestra "Ver anteriores"', async () => {
    montar({ 'GET /tickets/5/linea-tiempo': rutaLineaTiempo({ '': SEGUNDA }) })
    expect(await screen.findByText('Motivo 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: textos.verAnteriores })).not.toBeInTheDocument()
  })

  it('muestra el esqueleto mientras carga', async () => {
    let soltar: () => void = () => {}
    montar({
      'GET /tickets/5/linea-tiempo': () =>
        new Promise<Response>((resolver) => {
          soltar = () => resolver(respuesta(200, SEGUNDA))
        }),
    })
    expect(screen.getByRole('status', { name: textos.cargando })).toBeInTheDocument()
    soltar()
    expect(await screen.findByText('Motivo 1')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: textos.cargando })).not.toBeInTheDocument()
  })

  it('si falla muestra el error, y "Reintentar" vuelve a pedir', async () => {
    let falla = true
    montar({
      'GET /tickets/5/linea-tiempo': () => (falla ? respuesta(500, { codigo: 'ERROR', mensaje: 'x' }) : respuesta(200, SEGUNDA)),
    })
    expect(await screen.findByText(textos.errorCarga)).toBeInTheDocument()
    falla = false
    fireEvent.click(screen.getByRole('button', { name: textos.reintentar }))
    expect(await screen.findByText('Motivo 1')).toBeInTheDocument()
    expect(screen.queryByText(textos.errorCarga)).not.toBeInTheDocument()
  })

  it('sin eventos muestra el texto vacío', async () => {
    montar({ 'GET /tickets/5/linea-tiempo': rutaLineaTiempo({ '': { datos: [], siguienteCursor: null } }) })
    expect(await screen.findByText(textos.vacio)).toBeInTheDocument()
  })
})

describe('Historial en el detalle', () => {
  const QUEJA: TicketDetalle = {
    id: 5,
    numero: 'Q-2026-000005',
    estado: 'en_proceso',
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
    esSolicitante: true,
    resolucion: null,
    confirmacion: null,
    cierreAutomatico: false,
    sla: null,
  }

  it('aparece en /tickets/:id, y comentar desde el detalle lo actualiza', async () => {
    let comentado = false
    const fetchMock = simularApi({
      'GET /tickets/5': () => respuesta(200, QUEJA),
      'GET /tickets/5/comentarios': () => respuesta(200, { datos: [] }),
      'GET /tickets/5/adjuntos': () => respuesta(200, { datos: [] }),
      'GET /tickets/5/linea-tiempo': () =>
        respuesta(200, {
          datos: comentado
            ? [
                {
                  id: 'comentario:9',
                  ocurridoEn: '2026-10-21T15:00:00.000Z',
                  actor: { tipo: 'tu' },
                  detalle: { tipo: 'comentario', comentarioId: 9, interno: false },
                },
                cambio(1, 10),
              ]
            : [cambio(1, 10)],
          siguienteCursor: null,
        }),
      'POST /tickets/5/comentarios': () => {
        comentado = true
        return respuesta(201, {
          comentario: {
            id: 9,
            cuerpo: 'Sigue saliendo agua',
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
    })
    renderConConsultas(
      <SessionProvider session={{ usuarioId: 7, nombre: 'Ana López', rol: 'vecino', dependenciaId: null }}>
        <DetalleQueja ticketId={5} />
      </SessionProvider>,
    )

    expect(await screen.findByText('Motivo 1')).toBeInTheDocument()
    expect(llamadasLineaTiempo(fetchMock)).toHaveLength(1)

    fireEvent.change(screen.getByRole('textbox', { name: comentarios.campo }), { target: { value: 'Sigue saliendo agua' } })
    fireEvent.click(screen.getByRole('button', { name: comentarios.enviar }))

    expect(await screen.findByText('Tú comentaste')).toBeInTheDocument()
    expect(llamadasLineaTiempo(fetchMock)).toHaveLength(2)
  })
})
