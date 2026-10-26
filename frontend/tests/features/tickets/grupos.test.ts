import { describe, expect, it } from 'vitest'
import { contarGrupo, estadosDelGrupo, grupoDesde, ORDEN_GRUPOS } from '../../../src/features/tickets/mis-quejas/grupos'

const porEstado = {
  nueva: 1,
  en_revision: 2,
  asignada: 3,
  en_proceso: 4,
  en_espera: 5,
  resuelta: 6,
  cerrada: 7,
  rechazada: 8,
}
const RESUMEN = { porEstado, total: 36 }

describe('grupos del vecino (SPEC 38)', () => {
  it('cada grupo convierte a sus estados, y entre todos cubren los 8 una sola vez', () => {
    expect(estadosDelGrupo('todas')).toEqual([])
    expect(estadosDelGrupo('respuesta')).toEqual(['en_espera'])
    expect(estadosDelGrupo('en_curso')).toEqual(['nueva', 'en_revision', 'asignada', 'en_proceso'])
    expect(estadosDelGrupo('por_confirmar')).toEqual(['resuelta'])
    expect(estadosDelGrupo('finalizadas')).toEqual(['cerrada', 'rechazada'])
    const todos = ORDEN_GRUPOS.flatMap((g) => [...estadosDelGrupo(g)])
    expect(new Set(todos).size).toBe(8)
    expect(todos).toHaveLength(8)
  })

  it('los contadores suman desde porEstado, y "todas" es el total', () => {
    expect(contarGrupo('todas', RESUMEN)).toBe(36)
    expect(contarGrupo('respuesta', RESUMEN)).toBe(5)
    expect(contarGrupo('en_curso', RESUMEN)).toBe(10)
    expect(contarGrupo('por_confirmar', RESUMEN)).toBe(6)
    expect(contarGrupo('finalizadas', RESUMEN)).toBe(15)
  })

  it('un grupo desconocido o ausente es "todas"', () => {
    expect(grupoDesde(null)).toBe('todas')
    expect(grupoDesde('inventado')).toBe('todas')
    expect(grupoDesde('finalizadas')).toBe('finalizadas')
  })
})
