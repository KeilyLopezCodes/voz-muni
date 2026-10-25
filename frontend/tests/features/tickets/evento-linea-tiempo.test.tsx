import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActorEvento, DetalleEvento, EventoLineaTiempo as Evento } from '../../../src/features/tickets/api/linea-tiempo-api'
import { EventoLineaTiempo } from '../../../src/features/tickets/linea-tiempo/EventoLineaTiempo'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'

const { lineaTiempo: textos, estados } = tickets

const TECNICO: ActorEvento = { tipo: 'usuario', id: 7, nombre: 'Tomás Pérez', rol: 'tecnico', esSolicitante: false }
const COORDINADORA: ActorEvento = { tipo: 'usuario', id: 8, nombre: 'Carla Ruiz', rol: 'coordinador', esSolicitante: false }

function evento(detalle: DetalleEvento, actor: ActorEvento = TECNICO): Evento {
  return { id: `${detalle.tipo}:1`, ocurridoEn: '2026-10-20T21:30:00.000Z', actor, detalle }
}

const montar = (e: Evento) => render(<ul><EventoLineaTiempo evento={e} /></ul>)

describe('EventoLineaTiempo', () => {
  it.each<[string, DetalleEvento, string]>([
    ['la creación', { tipo: 'estado', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null }, 'Se registró la queja'],
    [
      'un cambio de estado',
      { tipo: 'estado', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null },
      `Tomás Pérez (Técnico) cambió el estado a ${estados.en_proceso}`,
    ],
    [
      'una asignación',
      { tipo: 'asignacion', tecnicoAnterior: null, tecnicoNuevo: { id: 3, nombre: 'Luis Gómez' }, motivo: null },
      'Tomás Pérez (Técnico) asignó a Luis Gómez',
    ],
    [
      'una reasignación',
      {
        tipo: 'asignacion',
        tecnicoAnterior: { id: 3, nombre: 'Luis Gómez' },
        tecnicoNuevo: { id: 4, nombre: 'Rosa Díaz' },
        motivo: 'Tiene menos carga',
      },
      'Tomás Pérez (Técnico) reasignó de Luis Gómez a Rosa Díaz',
    ],
    [
      'una solicitud de traslado con sugerencia',
      { tipo: 'traslado_solicitado', solicitudId: 2, dependenciaOrigen: 'Obras', dependenciaSugerida: 'Alumbrado', motivo: 'Es un poste' },
      'Tomás Pérez (Técnico) solicitó trasladar a Alumbrado',
    ],
    [
      'una solicitud de traslado sin sugerencia',
      { tipo: 'traslado_solicitado', solicitudId: 2, dependenciaOrigen: 'Obras', dependenciaSugerida: null, motivo: 'No es de Obras' },
      'Tomás Pérez (Técnico) solicitó trasladar a otra dependencia',
    ],
    ['un traslado rechazado', { tipo: 'traslado_rechazado', solicitudId: 2, motivo: 'Sí es de Obras' }, textos.eventos.trasladoRechazado],
    ['un traslado retirado', { tipo: 'traslado_retirado', solicitudId: 2, motivo: null }, textos.eventos.trasladoRetirado],
    ['un traslado sin efecto', { tipo: 'traslado_sin_efecto', solicitudId: 2, motivo: null }, textos.eventos.trasladoSinEfecto],
    ['un comentario', { tipo: 'comentario', comentarioId: 9, interno: false }, 'Tomás Pérez (Técnico) comentó'],
    ['una nota interna', { tipo: 'comentario', comentarioId: 9, interno: true }, 'Tomás Pérez (Técnico) agregó una nota interna'],
    ['un adjunto', { tipo: 'adjunto', adjuntoId: 4, nombre: 'foto.jpg', interno: false }, 'Tomás Pérez (Técnico) adjuntó foto.jpg'],
  ])('%s muestra su frase traducida', (_caso, detalle, texto) => {
    montar(evento(detalle))
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('muestra la fecha en la hora de Guatemala', () => {
    montar(evento({ tipo: 'estado', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null }))
    const fecha = screen.getByText((_texto, elemento) => elemento?.tagName === 'TIME')
    expect(fecha).toHaveAttribute('dateTime', '2026-10-20T21:30:00.000Z')
    // 21:30 UTC son las 15:30 en Guatemala (UTC−6).
    expect(fecha.textContent).toMatch(/3:30|15:30/)
  })

  describe('actores', () => {
    const cambio: DetalleEvento = { tipo: 'estado', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null }

    it('tu → "Tú", en segunda persona', () => {
      montar(evento(cambio, { tipo: 'tu' }))
      expect(screen.getByText(`Tú cambiaste el estado a ${estados.en_proceso}`)).toBeInTheDocument()
    })

    it('municipalidad → "Municipalidad"', () => {
      montar(evento(cambio, { tipo: 'municipalidad' }))
      expect(screen.getByText(`Municipalidad cambió el estado a ${estados.en_proceso}`)).toBeInTheDocument()
    })

    it('sistema → "VozMuni"', () => {
      montar(evento(cambio, { tipo: 'sistema' }))
      expect(screen.getByText(`VozMuni cambió el estado a ${estados.en_proceso}`)).toBeInTheDocument()
    })

    it('usuario → "<nombre> (<rol>)", y "Vecino" si es el solicitante', () => {
      montar(evento(cambio, { tipo: 'usuario', id: 1, nombre: 'Ana López', rol: 'vecino', esSolicitante: true }))
      expect(screen.getByText(`Ana López (Vecino) cambió el estado a ${estados.en_proceso}`)).toBeInTheDocument()
    })

    it('si la frase no nombra al actor, va junto a la fecha', () => {
      montar(evento({ tipo: 'traslado_rechazado', solicitudId: 2, motivo: null }, COORDINADORA))
      expect(screen.getByText(/Carla Ruiz \(Coordinador\) ·/)).toBeInTheDocument()
    })
  })

  it('el motivo con <b> se muestra como texto', () => {
    const { container } = montar(
      evento({ tipo: 'estado', estadoAnterior: 'en_proceso', estadoNuevo: 'en_espera', motivo: '<b>Envíe</b> una foto\nde cerca' }),
    )
    expect(screen.getByText(/<b>Envíe<\/b> una foto/)).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('la marca "Interno" es un texto visible', () => {
    montar(evento({ tipo: 'adjunto', adjuntoId: 4, nombre: 'evidencia.jpg', interno: true }))
    expect(screen.getByText(textos.interno)).toBeVisible()
  })

  it('un evento público no lleva la marca "Interno"', () => {
    montar(evento({ tipo: 'comentario', comentarioId: 9, interno: false }))
    expect(screen.queryByText(textos.interno)).not.toBeInTheDocument()
  })

  it('el comentario enlaza a su ancla en el hilo', () => {
    montar(evento({ tipo: 'comentario', comentarioId: 9, interno: false }))
    expect(screen.getByRole('link', { name: textos.verComentario })).toHaveAttribute('href', '#comentario-9')
  })

  it('el adjunto enlaza a la lista de adjuntos', () => {
    montar(evento({ tipo: 'adjunto', adjuntoId: 4, nombre: 'foto.jpg', interno: false }))
    expect(screen.getByRole('link', { name: textos.verAdjuntos })).toHaveAttribute('href', '#adjuntos')
  })
})
