import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Comentario } from '../../../src/features/tickets/api/comentarios-api'
import { HiloComentarios } from '../../../src/features/tickets/comentarios/HiloComentarios'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { type Manejador, respuesta, simularApi } from './api-simulada'

const { comentarios: textos } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function comentario(cambios: Partial<Comentario> = {}): Comentario {
  return {
    id: 1,
    cuerpo: 'Iremos el jueves',
    interno: false,
    autor: { id: 30, nombre: 'Luis Técnico', rol: 'tecnico' },
    esDelSolicitante: false,
    creadoEn: new Date(Date.now() - 10 * 60_000).toISOString(),
    editadoEn: null,
    editable: false,
    ...cambios,
  }
}

function montar({
  datos = [comentario()],
  estado = 'en_proceso',
  rol = 'tecnico',
  rutas = {},
}: { datos?: Comentario[]; estado?: string; rol?: Rol; rutas?: Record<string, Manejador> } = {}) {
  const fetchMock = simularApi({ 'GET /tickets/5/comentarios': () => respuesta(200, { datos }), ...rutas })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={{ usuarioId: 30, rol, dependenciaId: 4 }}>
        <HiloComentarios ticketId={5} estadoTicket={estado} clavesBandeja={['tickets', 'atencion']} />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { fetchMock, invalidar }
}

const cuerpoEnviado = (fetchMock: ReturnType<typeof simularApi>, metodo = 'POST') => {
  const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === metodo)
  return llamada ? JSON.parse(llamada[1]?.body as string) : undefined
}

const campo = () => screen.getByRole('textbox', { name: textos.campo })
const enviar = () => screen.getByRole('button', { name: textos.enviar })

describe('HiloComentarios', () => {
  it('muestra las notas internas marcadas con texto, el rol, "Vecino" y "editado"', async () => {
    montar({
      datos: [
        comentario({ id: 1, interno: true, cuerpo: 'Llevar pala' }),
        comentario({ id: 2, cuerpo: 'Es la casa 12', esDelSolicitante: true, autor: { id: 7, nombre: 'Ana López', rol: 'vecino' } }),
        comentario({ id: 3, cuerpo: 'Corregido', editadoEn: new Date().toISOString() }),
      ],
    })

    const articulos = await screen.findAllByRole('article')
    expect(articulos).toHaveLength(3)
    expect(within(articulos[0]).getByText(textos.notaInterna)).toBeInTheDocument()
    expect(within(articulos[0]).getByText(textos.roles.tecnico)).toBeInTheDocument()
    expect(within(articulos[1]).getByText(textos.vecino)).toBeInTheDocument()
    expect(within(articulos[1]).queryByText(textos.notaInterna)).not.toBeInTheDocument()
    expect(within(articulos[2]).getByText(textos.editado)).toBeInTheDocument()
    expect(articulos[0]).toHaveTextContent('hace 10 min')
  })

  it('el selector tiene "Nota interna" por defecto y envía interno: true', async () => {
    const { fetchMock } = montar({
      rutas: { 'POST /tickets/5/comentarios': () => respuesta(201, { comentario: comentario(), ticket: { id: 5, estado: 'en_proceso' } }) },
    })
    await screen.findAllByRole('article')

    expect(screen.getByRole('button', { name: textos.notaInterna })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(campo(), { target: { value: 'Llevar pala' } })
    fireEvent.click(enviar())

    await waitFor(() => expect(cuerpoEnviado(fetchMock)).toEqual({ cuerpo: 'Llevar pala', interno: true }))
  })

  it('al elegir "Público" envía interno: false', async () => {
    const { fetchMock } = montar({
      rutas: { 'POST /tickets/5/comentarios': () => respuesta(201, { comentario: comentario(), ticket: { id: 5, estado: 'en_proceso' } }) },
    })
    await screen.findAllByRole('article')

    fireEvent.click(screen.getByRole('button', { name: textos.publico }))
    fireEvent.change(campo(), { target: { value: 'Iremos el jueves' } })
    fireEvent.click(enviar())

    await waitFor(() => expect(cuerpoEnviado(fetchMock)).toEqual({ cuerpo: 'Iremos el jueves', interno: false }))
  })

  it('en una queja final el selector solo permite la nota interna', async () => {
    montar({ estado: 'cerrada' })
    await screen.findAllByRole('article')

    expect(screen.getByRole('button', { name: textos.publico })).toBeDisabled()
    expect(screen.getByRole('button', { name: textos.notaInterna })).toHaveAttribute('aria-pressed', 'true')
  })

  it('un rol sin notas internas no ve el selector', async () => {
    montar({ rol: 'vecino' })
    await screen.findAllByRole('article')

    expect(screen.queryByRole('group', { name: textos.visibilidad })).not.toBeInTheDocument()
  })

  it('el contador bloquea más de 4000 caracteres y un texto vacío', async () => {
    montar()
    await screen.findAllByRole('article')

    expect(enviar()).toBeDisabled()
    fireEvent.change(campo(), { target: { value: 'a'.repeat(4001) } })
    expect(screen.getByText('4001 / 4000')).toBeInTheDocument()
    expect(enviar()).toBeDisabled()
    fireEvent.change(campo(), { target: { value: 'a'.repeat(4000) } })
    expect(enviar()).toBeEnabled()
  })

  it('"Editar" aparece solo si el comentario es editable, y guarda el texto nuevo', async () => {
    const { fetchMock } = montar({
      datos: [comentario({ id: 1, editable: true }), comentario({ id: 2, cuerpo: 'De otro' })],
      rutas: { 'PATCH /tickets/5/comentarios/1': () => respuesta(200, comentario({ cuerpo: 'Iremos el viernes' })) },
    })
    const [propio, ajeno] = await screen.findAllByRole('article')

    expect(within(ajeno).queryByRole('button', { name: textos.editar })).not.toBeInTheDocument()
    fireEvent.click(within(propio).getByRole('button', { name: textos.editar }))
    fireEvent.change(within(propio).getByRole('textbox', { name: textos.editarCampo }), { target: { value: 'Iremos el viernes' } })
    fireEvent.click(within(propio).getByRole('button', { name: textos.guardar }))

    await waitFor(() => expect(cuerpoEnviado(fetchMock, 'PATCH')).toEqual({ cuerpo: 'Iremos el viernes' }))
  })

  it('EDICION_VENCIDA muestra "Ya no se puede editar"', async () => {
    montar({
      datos: [comentario({ id: 1, editable: true })],
      rutas: { 'PATCH /tickets/5/comentarios/1': () => respuesta(409, { codigo: 'EDICION_VENCIDA', mensaje: 'x' }) },
    })
    const [propio] = await screen.findAllByRole('article')

    fireEvent.click(within(propio).getByRole('button', { name: textos.editar }))
    fireEvent.click(within(propio).getByRole('button', { name: textos.guardar }))

    expect(await screen.findByText(textos.edicionVencida)).toBeInTheDocument()
  })

  it('enviar invalida el hilo, y la bandeja solo si cambió el estado', async () => {
    const creado = (estado: string) => () => respuesta(201, { comentario: comentario(), ticket: { id: 5, estado } })

    const igual = montar({ rutas: { 'POST /tickets/5/comentarios': creado('en_proceso') } })
    await screen.findAllByRole('article')
    fireEvent.change(campo(), { target: { value: 'Hola' } })
    fireEvent.click(enviar())
    await waitFor(() => expect(igual.invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'comentarios', 5] }))
    expect(igual.invalidar).not.toHaveBeenCalledWith({ queryKey: ['tickets', 'atencion'] })
  })

  it('si el comentario cambió el estado de la queja, también invalida la bandeja', async () => {
    const { invalidar } = montar({
      estado: 'en_espera',
      rutas: { 'POST /tickets/5/comentarios': () => respuesta(201, { comentario: comentario(), ticket: { id: 5, estado: 'en_proceso' } }) },
    })
    await screen.findAllByRole('article')

    fireEvent.change(campo(), { target: { value: 'Respuesta' } })
    fireEvent.click(enviar())

    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tickets', 'atencion'] }))
  })
})
