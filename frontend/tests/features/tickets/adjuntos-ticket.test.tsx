import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adjunto } from '../../../src/features/tickets/api/adjuntos-api'
import { AdjuntosTicket } from '../../../src/features/tickets/adjuntos/AdjuntosTicket'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { adjuntos: textos } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function adjunto(cambios: Partial<Adjunto> = {}): Adjunto {
  return {
    id: 1,
    nombre: 'foto del bache.jpg',
    mime: 'image/jpeg',
    tamanoBytes: 2_621_440,
    interno: false,
    origen: 'registro',
    subidoPor: { id: 7, nombre: 'Ana López', rol: 'vecino' },
    creadoEn: new Date().toISOString(),
    borrable: false,
    ...cambios,
  }
}

function montar({
  datos = [adjunto()],
  estado = 'en_proceso',
  rol = 'tecnico',
  rutas = {},
}: { datos?: Adjunto[]; estado?: string; rol?: Rol; rutas?: Record<string, Manejador> } = {}) {
  const fetchMock = simularApi({ 'GET /tickets/5/adjuntos': () => respuesta(200, { datos }), ...rutas })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={{ usuarioId: 30, nombre: 'Usuario Prueba', rol, dependenciaId: 4 }}>
        <AdjuntosTicket ticketId={5} estadoTicket={estado} />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { fetchMock, invalidar }
}

const archivo = (nombre: string, tamano = 100, tipo = 'application/pdf') => {
  const contenido = new File([new Uint8Array(tamano)], nombre, { type: tipo })
  return contenido
}

function elegir(archivos: File[]) {
  fireEvent.change(screen.getByTestId('entrada-evidencia'), { target: { files: archivos } })
}

const cuerpoSubida = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.body as FormData | undefined

describe('AdjuntosTicket', () => {
  it('la lista muestra tipo, nombre, tamaño, autor y marca los internos con texto', async () => {
    montar({
      datos: [
        adjunto(),
        adjunto({ id: 2, nombre: 'informe.pdf', mime: 'application/pdf', interno: true, origen: 'atencion', tamanoBytes: 850_000 }),
      ],
    })

    const [foto, informe] = await screen.findAllByRole('article')
    expect(foto).toHaveTextContent('JPG')
    expect(foto).toHaveTextContent('foto del bache.jpg')
    expect(foto).toHaveTextContent('2,5 MB · Ana López')
    expect(within(foto).queryByText(textos.interno)).not.toBeInTheDocument()
    expect(within(foto).getByRole('button', { name: textos.ver })).toBeInTheDocument()
    expect(within(informe).getByText(textos.interno)).toBeInTheDocument()
    expect(within(informe).queryByRole('button', { name: textos.ver })).not.toBeInTheDocument()
    expect(within(informe).getByRole('button', { name: textos.descargar })).toBeInTheDocument()
  })

  it('"Borrar" aparece solo si el adjunto es borrable, y borrar recarga la lista', async () => {
    const { fetchMock, invalidar } = montar({
      datos: [adjunto({ id: 1, borrable: true }), adjunto({ id: 2, nombre: 'otro.jpg' })],
      rutas: { 'DELETE /tickets/5/adjuntos/1': () => new Response(null, { status: 204 }) },
    })
    const [propio, ajeno] = await screen.findAllByRole('article')

    expect(within(ajeno).queryByRole('button', { name: textos.borrar })).not.toBeInTheDocument()
    fireEvent.click(within(propio).getByRole('button', { name: textos.borrar }))

    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'adjuntos', 5] }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
  })

  it('el selector tiene "Interno" por defecto y se muestra el cupo restante', async () => {
    montar({ datos: [adjunto(), adjunto({ id: 2, origen: 'atencion' }), adjunto({ id: 3, origen: 'atencion' })] })
    await screen.findAllByRole('article')

    expect(screen.getByRole('button', { name: textos.interno })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Te quedan 3 de 5')).toBeInTheDocument()
  })

  it('subir envía los archivos con interno=true por defecto y recarga', async () => {
    const { fetchMock, invalidar } = montar({
      rutas: { 'POST /tickets/5/adjuntos': () => respuesta(201, { adjuntos: [] }) },
    })
    await screen.findAllByRole('article')

    elegir([archivo('informe.pdf')])

    await waitFor(() => expect(cuerpoSubida(fetchMock)).toBeDefined())
    const form = cuerpoSubida(fetchMock)!
    expect(form.get('interno')).toBe('true')
    expect((form.getAll('archivos') as File[]).map((f) => f.name)).toEqual(['informe.pdf'])
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'adjuntos', 5] }))
  })

  it('en una queja final solo permite "Interno"', async () => {
    montar({ estado: 'cerrada' })
    await screen.findAllByRole('article')

    expect(screen.getByRole('button', { name: textos.publico })).toBeDisabled()
  })

  it('el cliente rechaza un tipo no permitido, uno de más de 10 MB y más archivos que el cupo', async () => {
    const { fetchMock } = montar({ datos: [adjunto({ origen: 'atencion' }), adjunto({ id: 2, origen: 'atencion' })] })
    await screen.findAllByRole('article')

    elegir([archivo('animacion.gif', 10, 'image/gif'), archivo('grande.pdf', 10 * 1024 * 1024 + 1)])
    expect(await screen.findByText('animacion.gif: solo se aceptan PDF, JPG, PNG o DOCX.')).toBeInTheDocument()
    expect(screen.getByText('grande.pdf: supera los 10 MB.')).toBeInTheDocument()

    elegir([archivo('a.pdf'), archivo('b.pdf'), archivo('c.pdf'), archivo('d.pdf')])
    expect(await screen.findByText('Solo caben 3 archivos más.')).toBeInTheDocument()
    expect(cuerpoSubida(fetchMock)).toBeUndefined()
  })

  it.each([
    [{ codigo: 'LIMITE_ADJUNTOS', detalles: [{ campo: 'restantes', problema: '1' }] }, 409, 'Solo caben 1 archivos más.'],
    [
      { codigo: 'ADJUNTO_INVALIDO', detalles: [{ campo: 'factura.pdf', problema: 'CONTENIDO_NO_COINCIDE' }] },
      400,
      'factura.pdf: el contenido no corresponde a su tipo.',
    ],
    [{ codigo: 'ADJUNTOS_CERRADOS' }, 409, textos.errores.cerrados],
  ])('el error %o muestra su mensaje', async (cuerpo, status, mensaje) => {
    montar({ rutas: { 'POST /tickets/5/adjuntos': () => respuesta(status, { mensaje: 'x', ...cuerpo }) } })
    await screen.findAllByRole('article')

    elegir([archivo('factura.pdf')])

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
  })
})
