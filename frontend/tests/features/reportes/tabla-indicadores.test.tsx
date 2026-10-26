import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { IndicadoresDeGrupo } from '../../../src/features/reportes/api/reportes-api'
import { agruparZonas } from '../../../src/features/reportes/componentes/datos-graficas'
import { ordenarFilas, TablaIndicadores } from '../../../src/features/reportes/componentes/TablaIndicadores'
import reportes from '../../../src/locales/es/reportes.json'
import '../../../src/shared/i18n/i18n'

function fila(id: number, nombre: string, porcentaje: number | null, cantidad = 1): IndicadoresDeGrupo {
  return {
    id,
    nombre,
    cantidad,
    horasPromedioRespuesta: null,
    horasPromedioResolucion: 2.5,
    cumplimientoRespuesta: { cumple: 0, incumple: 0, pendiente: 0, porcentaje },
    cumplimientoResolucion: { cumple: 0, incumple: 0, pendiente: 0, porcentaje: null },
    escaladasAbiertas: 0,
  }
}

const FILAS = [fila(1, 'Obras', 50, 3), fila(2, 'Agua', null, 5), fila(3, 'Parques', 90, 1)]
const nombres = () => screen.getAllByRole('rowheader').map((celda) => celda.textContent)

describe('TablaIndicadores', () => {
  it('por defecto ordena por cantidad, de mayor a menor', () => {
    render(<TablaIndicadores titulo="Indicadores por dependencia" filas={FILAS} />)
    expect(nombres()).toEqual(['Agua', 'Obras', 'Parques'])
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '5',
      '—',
      '2.5',
      '—',
      '—',
      '0',
    ])
  })

  it('ordenar por % de cumplimiento funciona en las dos direcciones y deja los null al final', () => {
    render(<TablaIndicadores titulo="Indicadores por dependencia" filas={FILAS} />)
    const encabezado = screen.getByRole('button', {
      name: `Ordenar por ${reportes.tablas.columnas.cumplimientoRespuesta}`,
    })
    fireEvent.click(encabezado)
    expect(nombres()).toEqual(['Parques', 'Obras', 'Agua'])
    fireEvent.click(encabezado)
    expect(nombres()).toEqual(['Obras', 'Parques', 'Agua'])
  })

  it('ordenarFilas por nombre usa el orden del español', () => {
    expect(ordenarFilas([fila(1, 'Zona', 1), fila(2, 'Árbol', 1), fila(3, 'Banco', 1)], 'nombre', 'asc').map((f) => f.nombre)).toEqual([
      'Árbol',
      'Banco',
      'Zona',
    ])
  })

  it('sin filas muestra "Sin datos en este rango"', () => {
    render(<TablaIndicadores titulo="Indicadores por categoría" filas={[]} />)
    expect(screen.getByText(reportes.tablas.vacia)).toBeInTheDocument()
  })
})

describe('agruparZonas', () => {
  it('deja las 10 primeras y suma el resto en "Otras" a partir de la 11.ª', () => {
    const zonas = Array.from({ length: 13 }, (_, i) => ({ clave: String(i), etiqueta: `Zona ${i + 1}`, cantidad: 20 - i }))
    const agrupadas = agruparZonas(zonas, 'Otras')
    expect(agrupadas).toHaveLength(11)
    expect(agrupadas[9].etiqueta).toBe('Zona 10')
    expect(agrupadas[10]).toEqual({ clave: 'otras', etiqueta: 'Otras', cantidad: 10 + 9 + 8 })
  })

  it('con 10 o menos no agrega "Otras"', () => {
    const zonas = Array.from({ length: 10 }, (_, i) => ({ clave: String(i), etiqueta: `Zona ${i}`, cantidad: 1 }))
    expect(agruparZonas(zonas, 'Otras')).toHaveLength(10)
  })
})
