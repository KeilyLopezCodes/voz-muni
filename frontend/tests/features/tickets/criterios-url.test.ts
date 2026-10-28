import { describe, expect, it } from 'vitest'
import {
  aFiltrosConteo,
  aFiltrosListado,
  conCambio,
  criteriosPorDefecto,
  escribirCriterios,
  ESTADOS_POR_DEFECTO,
  leerCriterios,
} from '../../../src/features/tickets/listado/criterios-url'
import { hoyGuatemala } from '../../../src/features/tickets/registro/validar-datos-extra'

// 28 de octubre de 2026 a las 02:00 UTC es todavía el 27 en Guatemala (UTC−6).
const HOY = hoyGuatemala(new Date('2026-10-28T02:00:00Z'))

describe('criterios del listado interno (SPEC 45)', () => {
  it('la fecha de hoy se toma en Guatemala', () => {
    expect(HOY).toBe('2026-10-27')
  })

  it('la URL vacía da los estados activos y los últimos 30 días', () => {
    const criterios = leerCriterios(new URLSearchParams(), HOY)

    expect(criterios).toEqual(criteriosPorDefecto(HOY))
    expect(criterios.estados).toEqual(['nueva', 'en_revision', 'asignada', 'en_proceso', 'en_espera', 'resuelta'])
    expect(criterios).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-27', pagina: 1, escalado: false })
  })

  it('los valores por defecto no se escriben en la URL', () => {
    expect(escribirCriterios(criteriosPorDefecto(HOY), HOY).toString()).toBe('')
    // Los mismos estados en otro orden siguen siendo el valor por defecto.
    const reordenados = { ...criteriosPorDefecto(HOY), estados: [...ESTADOS_POR_DEFECTO].reverse() }
    expect(escribirCriterios(reordenados, HOY).toString()).toBe('')
  })

  it('lee y escribe todos los filtros, ida y vuelta', () => {
    const url =
      'estado=cerrada&estado=nueva&q=bache&dependenciaId=3&categoriaId=4&prioridad=alta' +
      '&desde=2026-10-01&hasta=2026-10-15&escalado=true&pagina=2'
    const criterios = leerCriterios(new URLSearchParams(url), HOY)

    expect(criterios).toEqual({
      estados: ['cerrada', 'nueva'],
      q: 'bache',
      dependenciaId: 3,
      categoriaId: 4,
      prioridad: 'alta',
      desde: '2026-10-01',
      hasta: '2026-10-15',
      escalado: true,
      pagina: 2,
    })
    expect(escribirCriterios(criterios, HOY).toString()).toBe(url)
  })

  it('el estado repetido se lee y se escribe en el mismo orden, sin duplicados', () => {
    const criterios = leerCriterios(new URLSearchParams('estado=resuelta&estado=nueva&estado=resuelta'), HOY)

    expect(criterios.estados).toEqual(['resuelta', 'nueva'])
    expect(escribirCriterios(criterios, HOY).getAll('estado')).toEqual(['resuelta', 'nueva'])
  })

  it.each([
    ['prioridad=x', { prioridad: null }],
    ['pagina=0', { pagina: 1 }],
    ['pagina=abc', { pagina: 1 }],
    ['dependenciaId=-3', { dependenciaId: null }],
    ['categoriaId=1.5', { categoriaId: null }],
    ['estado=inventado', { estados: ESTADOS_POR_DEFECTO }],
    ['q=a', { q: null }],
    ['escalado=false', { escalado: false }],
  ])('un valor inválido en la URL se ignora: %s', (url, esperado) => {
    expect(leerCriterios(new URLSearchParams(url), HOY)).toMatchObject(esperado)
  })

  it.each(['desde=2026-10-20&hasta=2026-10-01', 'desde=2025-01-01&hasta=2026-10-15'])(
    'un rango invertido o de más de 366 días vuelve a los últimos 30 días: %s',
    (url) => {
      expect(leerCriterios(new URLSearchParams(url), HOY)).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-27' })
    },
  )

  it('una fecha mal formada se ignora y se calcula desde la otra, como en /reportes', () => {
    expect(leerCriterios(new URLSearchParams('desde=2026-13-01&hasta=2026-10-15'), HOY)).toMatchObject({
      desde: '2026-09-16',
      hasta: '2026-10-15',
    })
  })

  it('cambiar un filtro vuelve a la página 1; cambiar la página la conserva', () => {
    const enPagina3 = { ...criteriosPorDefecto(HOY), pagina: 3 }

    expect(conCambio(enPagina3, { prioridad: 'alta' })).toMatchObject({ prioridad: 'alta', pagina: 1 })
    expect(conCambio(enPagina3, { pagina: 4 }).pagina).toBe(4)
  })

  it('los filtros de la API llevan las fechas siempre, y el resumen no lleva estados ni página', () => {
    const criterios = { ...criteriosPorDefecto(HOY), prioridad: 'urgente' as const, pagina: 2 }

    expect(aFiltrosListado(criterios)).toMatchObject({
      estados: ESTADOS_POR_DEFECTO,
      pagina: 2,
      desde: '2026-09-28',
      hasta: '2026-10-27',
      prioridad: 'urgente',
    })
    expect(aFiltrosConteo(criterios)).not.toHaveProperty('estados')
    expect(aFiltrosConteo(criterios)).not.toHaveProperty('pagina')
  })
})
