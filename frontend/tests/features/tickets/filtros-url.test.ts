import { describe, expect, it } from 'vitest'
import type { FiltrosGestion } from '../../../src/features/tickets/api/gestion-api'
import { filtrosAUrl, filtrosDesdeUrl, FILTROS_VACIOS, hayFiltros } from '../../../src/features/tickets/gestion/filtros-url'

const desde = (query: string) => filtrosDesdeUrl(new URLSearchParams(query))

describe('filtros-url (SPEC 45)', () => {
  it('ida y vuelta de todos los filtros, con estado repetido', () => {
    const filtros: FiltrosGestion = {
      estados: ['asignada', 'cerrada'],
      q: 'bache',
      dependenciaId: 3,
      categoriaId: 7,
      prioridad: 'alta',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      tecnico: 12,
      pagina: 2,
    }
    const url = filtrosAUrl(filtros)
    expect(url.getAll('estado')).toEqual(['asignada', 'cerrada'])
    expect(url.toString()).toBe(
      'estado=asignada&estado=cerrada&q=bache&dependenciaId=3&categoriaId=7&prioridad=alta&desde=2026-10-01&hasta=2026-10-31&tecnico=12&pagina=2',
    )
    expect(filtrosDesdeUrl(url)).toEqual(filtros)
  })

  it('tecnico=sin_asignar va y vuelve', () => {
    const filtros = { ...FILTROS_VACIOS, tecnico: 'sin_asignar' as const }
    expect(filtrosDesdeUrl(filtrosAUrl(filtros))).toEqual(filtros)
  })

  it('sin filtros, la URL queda vacía', () => {
    expect(filtrosAUrl(FILTROS_VACIOS).toString()).toBe('')
    expect(desde('')).toEqual(FILTROS_VACIOS)
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
    expect(hayFiltros({ ...FILTROS_VACIOS, pagina: 3 })).toBe(false)
    expect(hayFiltros({ ...FILTROS_VACIOS, prioridad: 'baja' })).toBe(true)
  })

  it.each([
    ['un estado desconocido', 'estado=abierta&estado=nueva', { estados: ['nueva'] }],
    ['un estado repetido', 'estado=nueva&estado=nueva', { estados: ['nueva'] }],
    ['una búsqueda de 1 carácter', 'q=a', { q: null }],
    ['una búsqueda con espacios', 'q=%20%20bache%20', { q: 'bache' }],
    ['un id no numérico', 'dependenciaId=obras', { dependenciaId: null }],
    ['un id 0', 'categoriaId=0', { categoriaId: null }],
    ['un id negativo', 'categoriaId=-2', { categoriaId: null }],
    ['una prioridad desconocida', 'prioridad=critica', { prioridad: null }],
    ['una fecha que no existe', 'desde=2026-02-30', { desde: null }],
    ['un formato de fecha inválido', 'hasta=01/10/2026', { hasta: null }],
    ['hasta anterior a desde', 'desde=2026-10-05&hasta=2026-10-01', { desde: '2026-10-05', hasta: null }],
    ['un técnico inválido', 'tecnico=juan', { tecnico: null }],
    ['una página inválida', 'pagina=0', { pagina: 1 }],
    ['una página no numérica', 'pagina=dos', { pagina: 1 }],
  ])('descarta %s', (_caso, query, esperado) => {
    expect(desde(query)).toEqual({ ...FILTROS_VACIOS, ...esperado })
  })
})
