import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TriagePage } from '../../../src/features/tickets/triage/TriagePage'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, rutasCatalogos, simularApi } from './api-simulada'
import { pagina, queja } from './triage-datos'

const { triage } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

// URLs de GET /tickets/triage que pidió la página, como URLSearchParams.
function consultasBandeja(fetchMock: ReturnType<typeof simularApi>): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([entrada]) => new URL(String(entrada), 'http://localhost'))
    .filter((url) => url.pathname === '/api/v1/tickets/triage')
    .map((url) => url.searchParams)
}

describe('TriagePage', () => {
  it('lista las quejas como tarjetas con número, título, categoría, zona, canal y antigüedad', async () => {
    simularApi({
      ...rutasCatalogos(),
      'GET /tickets/triage': () =>
        respuesta(
          200,
          pagina([
            queja(),
            queja({ id: 2, numero: 'Q-2026-000002', estado: 'en_revision', titulo: 'Bache profundo', canal: 'telefono' }),
          ]),
        ),
    })

    renderConConsultas(<TriagePage />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(triage.titulo)
    const primera = (await screen.findByRole('button', { name: triage.abrir.replace('{{numero}}', 'Q-2026-000001') }))
    expect(within(primera).getByText('Poste sin luz frente a la escuela')).toBeInTheDocument()
    expect(within(primera).getByText(triage.estados.nueva)).toBeInTheDocument()
    expect(primera).toHaveTextContent(`Alumbrado público · Zona 1 · ${triage.canales.portal}`)
    expect(primera).toHaveTextContent(/hace 3 h/)
    const segunda = screen.getByRole('button', { name: triage.abrir.replace('{{numero}}', 'Q-2026-000002') })
    expect(segunda).toHaveTextContent(triage.canales.telefono)
    expect(within(segunda).getByText(triage.estados.en_revision)).toBeInTheDocument()
  })

  it('sin quejas muestra el aviso de bandeja vacía', async () => {
    simularApi({ 'GET /tickets/triage': () => respuesta(200, pagina([])) })

    renderConConsultas(<TriagePage />)

    expect(await screen.findByText(triage.vacia)).toBeInTheDocument()
  })

  it('el filtro cambia la consulta y vuelve a la página 1', async () => {
    const fetchMock = simularApi({ 'GET /tickets/triage': () => respuesta(200, pagina([queja()])) })
    renderConConsultas(<TriagePage />)
    await screen.findByText('Poste sin luz frente a la escuela')

    fireEvent.click(screen.getByRole('button', { name: triage.filtro.nueva }))
    await vi.waitFor(() => expect(consultasBandeja(fetchMock)).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: triage.filtro.en_revision }))
    await vi.waitFor(() => expect(consultasBandeja(fetchMock)).toHaveLength(3))

    const [todas, nuevas, enRevision] = consultasBandeja(fetchMock)
    expect(todas.get('estado')).toBeNull()
    expect(todas.get('pagina')).toBe('1')
    expect(nuevas.get('estado')).toBe('nueva')
    expect(enRevision.get('estado')).toBe('en_revision')
    expect(enRevision.get('pagina')).toBe('1')
  })

  it('la paginación pide la página elegida', async () => {
    const fetchMock = simularApi({
      'GET /tickets/triage': (url) =>
        respuesta(200, pagina([queja({ titulo: `Queja de la página ${url.searchParams.get('pagina')}` })], { total: 45 })),
    })
    renderConConsultas(<TriagePage />)
    await screen.findByText('Queja de la página 1')

    const paginacion = screen.getByRole('navigation', { name: triage.paginacion })
    expect(within(paginacion).getByRole('button', { name: /3/ })).toBeInTheDocument()
    fireEvent.click(within(paginacion).getByRole('button', { name: /2/ }))

    expect(await screen.findByText('Queja de la página 2')).toBeInTheDocument()
    expect(consultasBandeja(fetchMock).at(-1)?.get('pagina')).toBe('2')
  })

  it('un error de carga muestra el aviso con reintentar', async () => {
    simularApi({ 'GET /tickets/triage': () => respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) })

    renderConConsultas(<TriagePage />)

    expect(await screen.findByText(triage.errorCarga)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: triage.reintentar })).toBeInTheDocument()
  })

  it('al elegir una tarjeta abre el panel con el detalle', async () => {
    simularApi({ ...rutasCatalogos(), 'GET /tickets/triage': () => respuesta(200, pagina([queja()])) })
    renderConConsultas(<TriagePage />)

    fireEvent.click(await screen.findByRole('button', { name: triage.abrir.replace('{{numero}}', 'Q-2026-000001') }))

    const panel = await screen.findByRole('region', { name: triage.panel.titulo.replace('{{numero}}', 'Q-2026-000001') })
    expect(within(panel).getByText('El poste lleva una semana apagado')).toBeInTheDocument()
  })
})
