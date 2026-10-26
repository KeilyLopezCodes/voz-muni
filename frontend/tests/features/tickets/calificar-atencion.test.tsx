import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EncuestaDetalle } from '../../../src/features/tickets/api/tickets-api'
import { CalificarAtencion, type CalificarAtencionProps } from '../../../src/features/tickets/mis-quejas/CalificarAtencion'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { encuesta: textos } = tickets.detalle

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(props: Partial<CalificarAtencionProps> = {}, rutas: Record<string, Manejador> = {}) {
  const fetchMock = simularApi(rutas)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CalificarAtencion
          ticketId={5}
          encuesta={null}
          puedeCalificar
          // 05:59:59.999 UTC del 30 de noviembre es el 29 a las 23:59 en Guatemala.
          encuestaVenceEn="2026-11-30T05:59:59.999Z"
          esSolicitante
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { fetchMock, invalidar }
}

const enviar = () => screen.getByRole('button', { name: textos.enviar })
const estrella = (n: number) => screen.getByRole('radio', { name: `${n} de 5` })

describe('CalificarAtencion', () => {
  it('no se puede enviar sin calificación; muestra el plazo en hora de Guatemala', () => {
    montar()
    expect(enviar()).toBeDisabled()
    expect(screen.getByText(/Puedes calificar hasta el 29 nov 2026.*23:59/)).toBeInTheDocument()
  })

  // Son radios nativos con el mismo name: el navegador da Tab y las flechas (jsdom no las simula).
  it('las 5 estrellas son un grupo de radio nativo con su aria-label', () => {
    montar()
    const nombres = new Set<string | null>()
    for (let n = 1; n <= 5; n++) {
      expect(estrella(n)).toHaveAttribute('type', 'radio')
      nombres.add(estrella(n).getAttribute('name'))
    }
    expect(nombres).toEqual(new Set(['calificacion-5']))
    fireEvent.click(estrella(3))
    expect(estrella(3)).toBeChecked()
    expect(enviar()).toBeEnabled()
  })

  it('el contador del comentario llega a 1000', () => {
    montar()
    const campo = screen.getByRole('textbox', { name: textos.comentario })
    expect(campo).toHaveAttribute('maxlength', '1000')
    fireEvent.change(campo, { target: { value: 'a'.repeat(1000) } })
    expect(screen.getByText('1000/1000')).toBeInTheDocument()
  })

  it('al enviar manda la calificación y el comentario recortado, agradece e invalida el detalle, la lista y el resumen', async () => {
    let cuerpo: unknown = null
    const { invalidar } = montar(
      {},
      {
        'POST /tickets/5/encuesta': async (_url, init) => {
          cuerpo = JSON.parse(String(init?.body))
          return respuesta(201, { calificacion: 2, comentario: 'Tardaron', creadoEn: '2026-11-02T15:00:00.000Z' })
        },
      },
    )
    fireEvent.click(estrella(2))
    fireEvent.change(screen.getByRole('textbox', { name: textos.comentario }), { target: { value: '  Tardaron  ' } })
    fireEvent.click(enviar())

    expect(await screen.findByText(textos.gracias)).toBeInTheDocument()
    expect(cuerpo).toEqual({ calificacion: 2, comentario: 'Tardaron' })
    const claves = invalidar.mock.calls.map(([filtro]) => JSON.stringify(filtro?.queryKey))
    expect(claves).toEqual(
      expect.arrayContaining([JSON.stringify(['tickets', 'detalle', 5]), JSON.stringify(['tickets', 'listado']), JSON.stringify(['tickets', 'resumen'])]),
    )
  })

  it.each([
    ['ENCUESTA_EXISTENTE', textos.errores.ENCUESTA_EXISTENTE],
    ['ENCUESTA_VENCIDA', textos.errores.ENCUESTA_VENCIDA],
  ])('un 409 %s muestra su mensaje y recarga', async (codigo, mensaje) => {
    const { invalidar } = montar({}, { 'POST /tickets/5/encuesta': () => respuesta(409, { codigo, mensaje: 'x' }) })
    fireEvent.click(estrella(5))
    fireEvent.click(enviar())

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    await waitFor(() => expect(invalidar).toHaveBeenCalled())
  })

  const ENCUESTA: EncuestaDetalle = { calificacion: 4, comentario: 'Bien <b>hecho</b>', creadoEn: '2026-11-02T15:00:00.000Z' }

  it('la calificación enviada se muestra en solo lectura al vecino, con el comentario como texto', () => {
    montar({ encuesta: ENCUESTA, puedeCalificar: false, encuestaVenceEn: null })
    expect(screen.getByText('Tu calificación: 4 de 5')).toBeInTheDocument()
    expect(screen.getByText('Bien <b>hecho</b>')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: textos.enviar })).not.toBeInTheDocument()
  })

  it('a los internos les dice "Calificación del vecino"', () => {
    montar({ encuesta: ENCUESTA, puedeCalificar: false, encuestaVenceEn: null, esSolicitante: false })
    expect(screen.getByText('Calificación del vecino: 4 de 5')).toBeInTheDocument()
  })

  it('sin encuesta y sin poder calificar no muestra nada', () => {
    montar({ puedeCalificar: false, encuestaVenceEn: null, esSolicitante: false })
    expect(screen.queryByText(textos.titulo)).not.toBeInTheDocument()
  })
})
