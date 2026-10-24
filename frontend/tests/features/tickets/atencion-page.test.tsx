import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AtencionPage } from '../../../src/features/tickets/atencion/AtencionPage'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from './api-simulada'
import { enAtencion, paginaAtencion } from './atencion-datos'

const { atencion, triage } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(rol: Rol = 'tecnico') {
  renderConConsultas(
    <SessionProvider session={{ usuarioId: 30, rol, dependenciaId: rol === 'supervisor' ? null : 4 }}>
      <AtencionPage />
    </SessionProvider>,
  )
}

const consultas = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname === '/api/v1/tickets/atencion')
    .map((url) => url.searchParams)

const tarjeta = (numero: string) => screen.findByRole('button', { name: atencion.abrir.replace('{{numero}}', numero) })

describe('AtencionPage', () => {
  it('las tarjetas muestran estado y prioridad traducidos, la antigüedad y la marca de traslado pendiente', async () => {
    simularApi({
      'GET /tickets/atencion': () =>
        respuesta(
          200,
          paginaAtencion([
            enAtencion(),
            enAtencion({ id: 2, numero: 'Q-2026-000002', estado: 'en_espera', prioridad: 'urgente', trasladoPendiente: true }),
          ]),
        ),
    })

    montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(atencion.titulo)
    const primera = await tarjeta('Q-2026-000001')
    expect(within(primera).getByText(atencion.estados.asignada)).toBeInTheDocument()
    expect(within(primera).getByText(triage.prioridades.alta)).toBeInTheDocument()
    expect(primera).toHaveTextContent('Baches · Zona 1 · hace 5 h')
    expect(primera).not.toHaveTextContent(atencion.trasladoPendiente)
    // El técnico no ve el técnico de cada queja: son todas suyas.
    expect(primera).not.toHaveTextContent('Luis Técnico')
    const segunda = await tarjeta('Q-2026-000002')
    expect(within(segunda).getByText(atencion.estados.en_espera)).toBeInTheDocument()
    expect(within(segunda).getByText(triage.prioridades.urgente)).toBeInTheDocument()
    expect(within(segunda).getByText(atencion.trasladoPendiente)).toBeInTheDocument()
  })

  it('el coordinador y el supervisor ven el técnico, o "Sin técnico"', async () => {
    simularApi({
      'GET /tickets/atencion': () => respuesta(200, paginaAtencion([enAtencion(), enAtencion({ id: 2, numero: 'Q-2026-000002', tecnico: null })])),
    })

    montar('coordinador')

    expect(await tarjeta('Q-2026-000001')).toHaveTextContent('Técnico: Luis Técnico')
    expect(await tarjeta('Q-2026-000002')).toHaveTextContent(atencion.sinTecnico)
  })

  it('el filtro cambia la consulta y vuelve a la página 1', async () => {
    const fetchMock = simularApi({ 'GET /tickets/atencion': () => respuesta(200, paginaAtencion([enAtencion()])) })
    montar()
    await tarjeta('Q-2026-000001')

    fireEvent.click(screen.getByRole('button', { name: atencion.filtro.en_espera }))
    await waitFor(() => expect(consultas(fetchMock)).toHaveLength(2))

    const [todas, espera] = consultas(fetchMock)
    expect(todas.get('estado')).toBe('todas')
    expect(espera.get('estado')).toBe('en_espera')
    expect(espera.get('pagina')).toBe('1')
  })

  it('la paginación pide la página elegida', async () => {
    const fetchMock = simularApi({
      'GET /tickets/atencion': (url) =>
        respuesta(200, paginaAtencion([enAtencion({ titulo: `Queja de la página ${url.searchParams.get('pagina')}` })], { total: 41 })),
    })
    montar()
    await screen.findByText('Queja de la página 1')

    fireEvent.click(within(screen.getByRole('navigation', { name: atencion.paginacion })).getByRole('button', { name: /2/ }))

    expect(await screen.findByText('Queja de la página 2')).toBeInTheDocument()
    expect(consultas(fetchMock).at(-1)?.get('pagina')).toBe('2')
  })

  it('sin quejas muestra el aviso de bandeja vacía', async () => {
    simularApi({ 'GET /tickets/atencion': () => respuesta(200, paginaAtencion([])) })

    montar()

    expect(await screen.findByText(atencion.vacia)).toBeInTheDocument()
  })
})
