const ZONA_HORARIA = 'America/Guatemala'

// Copia de las reglas del backend (domain/auditoria/consulta.ts, SPEC 41), que sigue siendo la fuente de verdad.
export const RANGO_MAXIMO_DIAS = 92
export const DIAS_POR_DEFECTO = 7

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

// La fecha local de Guatemala en YYYY-MM-DD (en-CA ya usa ese formato).
export function fechaLocalGuatemala(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instante,
  )
}

export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

export function esFechaValida(fecha: string | null): fecha is string {
  return fecha !== null && FORMATO_FECHA.test(fecha) && sumarDias(fecha, 0) === fecha
}

// Días del rango contando ambos extremos.
export function diasDelRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1
}

export type ProblemaRango = 'rangoInvertido' | 'rangoLargo' | null

export function problemaDelRango(desde: string, hasta: string): ProblemaRango {
  const dias = diasDelRango(desde, hasta)
  if (dias < 1) return 'rangoInvertido'
  return dias > RANGO_MAXIMO_DIAS ? 'rangoLargo' : null
}

export function fechaHoraGuatemala(instante: string, idioma: string): string {
  return new Intl.DateTimeFormat(idioma, { dateStyle: 'medium', timeStyle: 'medium', timeZone: ZONA_HORARIA }).format(
    new Date(instante),
  )
}
