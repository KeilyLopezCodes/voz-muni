import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketEscalado } from '../../../src/features/tickets/api/escaladas-api'
import { EscaladasPage } from '../../../src/features/tickets/escaladas/EscaladasPage'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from './api-simulada'

const { escaladas: textos, sla: textosSla } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function escalado(id: number, cambios: Partial<TicketEscalado> = {}): TicketEscalado {
  return {
    id,
    numero: `Q-2026-00000${id}`,
    titulo: `Bache ${id}`,
    estado: 'en_proceso',
    prioridad: 'alta',
    categoria: { id: 2, nombre: 'Baches' },
    dependencia: { id: 4, nombre: 'Dirección de Obras' },
    tecnico: { id: 9, nombre: 'Luis Técnico' },
    // 21:30 UTC = 15:30 en Guatemala.
    escaladoEn: '2026-11-02T21:30:00.000Z',
    escaladoPor: 'resolucion',
    sla: {
      venceRespuesta: '2026-11-02T15:00:00.000Z',
      primeraRespuestaEn: '2026-11-02T14:00:00.000Z',
      venceResolucion: '2026-11-02T21:30:00.000Z',
      pausado: false,
      restanteMinutosEnPausa: null,
      escalado: true,
      escaladoEn: '2026-11-02T21:30:00.000Z',
      escaladoPor: 'resolucion',
    },
    ...cambios,
  }
}

function montar(datos: TicketEscalado[] = [escalado(1), escalado(2, { estado: 'en_revision', dependencia: null, tecnico: null })]) {
  const fetchMock = simularApi({
    'GET /dependencias': () =>
      respuesta(200, [
        { id: 4, nombre: 'Dirección de Obras' },
        { id: 5, nombre: 'Servicios Públicos' },
      ]),
    'GET /tickets/escaladas': (url) =>
      respuesta(200, {
        datos: url.searchParams.get('dependenciaId') === '4' ? datos.filter((d) => d.dependencia?.id === 4) : datos,
        pagina: 1,
        tamano: 20,
        total: datos.length,
      }),
  })
  renderConConsultas(<EscaladasPage />)
  return fetchMock
}

const consultas = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/tickets/escaladas'))

describe('EscaladasPage', () => {
  it('muestra cada queja con "Escalada por resolución el…" en Guatemala, la dependencia y el enlace al detalle', async () => {
    montar()
    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000001' })
    expect(tarjeta.querySelector('time')).toHaveTextContent(/^Escalada por resolución el .*(15:30|3:30)/)
    expect(tarjeta.querySelector('time')).toHaveAttribute('dateTime', '2026-11-02T21:30:00.000Z')
    expect(within(tarjeta).getByText('Baches · Dirección de Obras')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Técnico: Luis Técnico')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Ver el detalle de la queja Q-2026-000001' })).toHaveAttribute(
      'href',
      '/tickets/1',
    )
    // La marca del indicador es un texto visible.
    expect(within(tarjeta).getByText(textosSla.escalada)).toBeVisible()
  })

  it('en revisión sin dependencia muestra "Sin dependencia" y "Sin técnico asignado"', async () => {
    montar()
    const tarjeta = await screen.findByRole('article', { name: 'Q-2026-000002' })
    expect(within(tarjeta).getByText(`Baches · ${textos.sinDependencia}`)).toBeInTheDocument()
    expect(within(tarjeta).getByText(textos.sinTecnico)).toBeInTheDocument()
  })

  it('el filtro por dependencia cambia la consulta y vuelve a la primera página', async () => {
    const fetchMock = montar()
    await screen.findByRole('article', { name: 'Q-2026-000002' })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.filtro }))
    fireEvent.click(await screen.findByRole('option', { name: 'Dirección de Obras' }))

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Q-2026-000002' })).not.toBeInTheDocument())
    const ultima = consultas(fetchMock).at(-1)!
    expect(ultima.searchParams.get('dependenciaId')).toBe('4')
    expect(ultima.searchParams.get('pagina')).toBe('1')
    expect(consultas(fetchMock)[0].searchParams.has('dependenciaId')).toBe(false)
  })

  it('sin quejas muestra "No hay quejas escaladas"', async () => {
    montar([])
    expect(await screen.findByText(textos.vacia)).toBeInTheDocument()
  })
})
