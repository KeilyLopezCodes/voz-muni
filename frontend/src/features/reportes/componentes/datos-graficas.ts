import type { DatoGrafica } from './GraficaBarras'

export const ZONAS_VISIBLES = 10
export const CLAVE_OTRAS = 'otras'

// Las 10 zonas con más quejas y, si hay más, una barra "Otras" con la suma del resto (SPEC 43). La lista ya llega
// ordenada de mayor a menor.
export function agruparZonas(zonas: readonly DatoGrafica[], etiquetaOtras: string): DatoGrafica[] {
  if (zonas.length <= ZONAS_VISIBLES) {
    return [...zonas]
  }
  const resto = zonas.slice(ZONAS_VISIBLES).reduce((suma, zona) => suma + zona.cantidad, 0)
  return [...zonas.slice(0, ZONAS_VISIBLES), { clave: CLAVE_OTRAS, etiqueta: etiquetaOtras, cantidad: resto }]
}
