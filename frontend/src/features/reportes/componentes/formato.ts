// Números del tablero (SPEC 43) en es-GT, con un decimal como máximo.
const NUMERO = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 })

export function formatoNumero(valor: number): string {
  return NUMERO.format(valor)
}

// Una fecha YYYY-MM-DD como 01/10/2026. Se formatea en UTC porque ya es una fecha local de Guatemala.
export function formatoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T00:00:00Z`))
}
