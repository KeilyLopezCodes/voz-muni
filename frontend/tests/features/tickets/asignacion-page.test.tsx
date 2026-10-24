import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AsignacionPage } from '../../../src/features/tickets/asignacion/AsignacionPage'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from './api-simulada'
import { paginaPorAsignar, porAsignar } from './asignacion-datos'

const { asignacion, triage } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(rol: Rol = 'coordinador') {
  renderConConsultas(
    <SessionProvider session={{ usuarioId: 1, rol, dependenciaId: rol === 'coordinador' ? 4 : null }}>
      <AsignacionPage />
    </SessionProvider>,
  )
}

// Parámetros de cada GET /tickets/por-asignar que hizo la página.
function consultasBandeja(fetchMock: ReturnType<typeof simularApi>): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname === '/api/v1/tickets/por-asignar')
    .map((url) => url.searchParams)
}

const tarjeta = (numero: string) => screen.findByRole('button', { name: asignacion.abrir.replace('{{numero}}', numero) })

describe('AsignacionPage', () => {
  it('las tarjetas muestran número, prioridad traducida, categoría, zona, técnico y antigüedad', async () => {
    simularApi({
      'GET /tickets/por-asignar': () =>
        respuesta(
          200,
          paginaPorAsignar([
            porAsignar(),
            porAsignar({
              id: 2,
              numero: 'Q-2026-000002',
              estado: 'en_proceso',
              prioridad: 'baja',
              tecnico: { id: 9, nombre: 'Luis Técnico' },
            }),
          ]),
        ),
    })

    montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(asignacion.titulo)
    const primera = await tarjeta('Q-2026-000001')
    expect(within(primera).getByText(triage.prioridades.urgente)).toBeInTheDocument()
    expect(within(primera).getByText(asignacion.estados.asignada)).toBeInTheDocument()
    expect(primera).toHaveTextContent('Baches · Zona 1 · hace 2 d')
    expect(primera).not.toHaveTextContent('Dirección de Obras')
    expect(within(primera).getByText(asignacion.sinTecnico)).toBeInTheDocument()
    const segunda = await tarjeta('Q-2026-000002')
    expect(within(segunda).getByText(triage.prioridades.baja)).toBeInTheDocument()
    expect(segunda).toHaveTextContent('Técnico: Luis Técnico')
  })

  it('el supervisor ve la dependencia de cada queja', async () => {
    simularApi({ 'GET /tickets/por-asignar': () => respuesta(200, paginaPorAsignar([porAsignar()])) })

    montar('supervisor')

    expect(await tarjeta('Q-2026-000001')).toHaveTextContent('Baches · Zona 1 · Dirección de Obras')
  })

  it('la vista cambia la consulta y vuelve a la página 1', async () => {
    const fetchMock = simularApi({ 'GET /tickets/por-asignar': () => respuesta(200, paginaPorAsignar([porAsignar()])) })
    montar()
    await tarjeta('Q-2026-000001')

    fireEvent.click(screen.getByRole('button', { name: asignacion.vista.abiertas }))
    await vi.waitFor(() => expect(consultasBandeja(fetchMock)).toHaveLength(2))

    const [sinTecnico, abiertas] = consultasBandeja(fetchMock)
    expect(sinTecnico.get('vista')).toBe('sin_tecnico')
    expect(abiertas.get('vista')).toBe('abiertas')
    expect(abiertas.get('pagina')).toBe('1')
  })

  it('la paginación pide la página elegida', async () => {
    const fetchMock = simularApi({
      'GET /tickets/por-asignar': (url) =>
        respuesta(
          200,
          paginaPorAsignar([porAsignar({ titulo: `Queja de la página ${url.searchParams.get('pagina')}` })], { total: 41 }),
        ),
    })
    montar()
    await screen.findByText('Queja de la página 1')

    const paginacion = screen.getByRole('navigation', { name: asignacion.paginacion })
    expect(within(paginacion).getByRole('button', { name: /3/ })).toBeInTheDocument()
    fireEvent.click(within(paginacion).getByRole('button', { name: /2/ }))

    expect(await screen.findByText('Queja de la página 2')).toBeInTheDocument()
    expect(consultasBandeja(fetchMock).at(-1)?.get('pagina')).toBe('2')
  })

  it('sin quejas muestra el aviso de bandeja vacía', async () => {
    simularApi({ 'GET /tickets/por-asignar': () => respuesta(200, paginaPorAsignar([])) })

    montar()

    expect(await screen.findByText(asignacion.vacia)).toBeInTheDocument()
  })

  it('al elegir una tarjeta abre el panel con los técnicos de su dependencia', async () => {
    simularApi({
      'GET /tickets/por-asignar': () => respuesta(200, paginaPorAsignar([porAsignar()])),
      'GET /dependencias/4/tecnicos': () => respuesta(200, [{ id: 9, nombre: 'Luis Técnico', carga: 3 }]),
    })
    montar()

    fireEvent.click(await tarjeta('Q-2026-000001'))

    const panel = await screen.findByRole('region', { name: asignacion.panel.titulo.replace('{{numero}}', 'Q-2026-000001') })
    expect(await within(panel).findByText('Luis Técnico · 3 abiertas')).toBeInTheDocument()
  })
})
