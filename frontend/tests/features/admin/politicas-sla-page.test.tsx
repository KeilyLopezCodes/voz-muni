import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoriaSla } from '../../../src/features/admin/api/politicas-sla-api'
import { PoliticasSlaPage } from '../../../src/features/admin/sla/PoliticasSlaPage'
import admin from '../../../src/locales/es/admin.json'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from '../tickets/api-simulada'

const { sla } = admin

afterEach(() => {
  vi.unstubAllGlobals()
})

const MATRIZ: CategoriaSla['plazos'] = [
  { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
  { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
  { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
  { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
]

function categoria(id: number, nombre: string, cambios: Partial<CategoriaSla> = {}): CategoriaSla {
  return {
    categoria: { id, nombre, activa: true },
    dependencia: { id: 1, nombre: 'Dirección de Obras' },
    plazos: MATRIZ,
    completa: true,
    actualizadoEn: '2026-10-20T21:30:00.000Z',
    actualizadoPor: { id: 6, nombre: 'Alma Admin' },
    ...cambios,
  }
}

// Ordenadas por nombre, como las devuelve el servidor.
const CATEGORIAS: CategoriaSla[] = [
  categoria(1, 'Aceras', { plazos: [], completa: false, actualizadoEn: null, actualizadoPor: null }),
  categoria(2, 'Baches'),
  categoria(3, 'Señalización', { plazos: MATRIZ.slice(0, 2), completa: false }),
  categoria(4, 'Zancudos', { categoria: { id: 4, nombre: 'Zancudos', activa: false }, plazos: [], completa: false }),
]

function montar(datos: CategoriaSla[] = CATEGORIAS) {
  const fetchMock = simularApi({ 'GET /admin/politicas-sla': () => respuesta(200, { datos }) })
  renderConConsultas(<PoliticasSlaPage />)
  return fetchMock
}

const tarjetas = () => screen.getAllByRole('listitem')
const tarjeta = (nombre: string) => tarjetas().find((li) => within(li).queryByRole('heading', { name: nombre }))!

describe('PoliticasSlaPage', () => {
  it('muestra el resumen de cada matriz, de urgente a baja', async () => {
    montar()
    const baches = await waitFor(() => tarjeta('Baches'))
    expect(within(baches).getByText('Dirección de Obras')).toBeInTheDocument()
    const filas = within(baches).getAllByRole('definition').map((dd) => dd.textContent)
    expect(filas).toEqual(['2 / 24 h', '8 / 48 h', '24 / 72 h', '48 / 120 h'])
    expect(within(baches).getAllByRole('term').map((dt) => dt.textContent)).toEqual(['Urgente', 'Alta', 'Media', 'Baja'])
  })

  it('las activas incompletas van primero con "Sin SLA", y el aviso las cuenta', async () => {
    montar()
    await screen.findByRole('heading', { name: 'Baches' })
    expect(tarjetas().map((li) => within(li).getByRole('heading').textContent)).toEqual([
      'Aceras',
      'Señalización',
      'Baches',
      'Zancudos',
    ])
    expect(within(tarjeta('Aceras')).getByText(sla.sinSla)).toBeInTheDocument()
    expect(within(tarjeta('Señalización')).getByText(sla.sinSla)).toBeInTheDocument()
    expect(within(tarjeta('Baches')).queryByText(sla.sinSla)).not.toBeInTheDocument()
    expect(screen.getByText('2 categorías activas no tienen SLA completo.')).toBeInTheDocument()
    expect(within(tarjeta('Señalización')).getAllByText(sla.sinPlazo)).toHaveLength(2)
  })

  it('con todas completas no muestra el aviso', async () => {
    montar([categoria(2, 'Baches')])
    await screen.findByRole('heading', { name: 'Baches' })
    expect(screen.queryByText(/no tiene(n)? SLA completo/)).not.toBeInTheDocument()
  })

  it('las inactivas llevan "Inactiva" y no cuentan como "Sin SLA"', async () => {
    montar()
    const zancudos = await waitFor(() => tarjeta('Zancudos'))
    expect(within(zancudos).getByText(sla.inactiva)).toBeInTheDocument()
    expect(within(zancudos).queryByText(sla.sinSla)).not.toBeInTheDocument()
  })

  it('la última actualización aparece en la hora de Guatemala con su autor', async () => {
    montar()
    const baches = await waitFor(() => tarjeta('Baches'))
    const fecha = within(baches).getByText(/por Alma Admin/)
    expect(fecha).toHaveAttribute('dateTime', '2026-10-20T21:30:00.000Z')
    // 21:30 UTC son las 15:30 en Guatemala (UTC−6).
    expect(fecha.textContent).toMatch(/3:30|15:30/)
    expect(within(tarjeta('Aceras')).getByText(sla.nuncaEditada)).toBeInTheDocument()
  })

  it('en pantalla ancha muestra una tabla', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    montar()
    const tabla = await screen.findByRole('table', { name: sla.titulo })
    expect(within(tabla).getAllByRole('row')).toHaveLength(5)
    expect(within(tabla).getByRole('columnheader', { name: sla.columnas.categoria })).toBeInTheDocument()
  })

  it('si falla la carga muestra el error con "Reintentar"', async () => {
    let falla = true
    simularApi({
      'GET /admin/politicas-sla': () => (falla ? respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) : respuesta(200, { datos: CATEGORIAS })),
    })
    renderConConsultas(<PoliticasSlaPage />)
    expect(await screen.findByText(sla.errorCarga)).toBeInTheDocument()
    falla = false
    fireEvent.click(screen.getByRole('button', { name: sla.reintentar }))
    expect(await screen.findByRole('heading', { name: 'Baches' })).toBeInTheDocument()
  })

  it('"Editar" abre el diálogo de esa categoría', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar el SLA de Baches' }))
    expect(screen.getByRole('dialog', { name: 'SLA de Baches' })).toBeInTheDocument()
  })
})
