// Antigüedad de una queja para las bandejas (SPEC 19 y 20).

const ZONA_HORARIA = 'America/Guatemala'

// "hace 3 h": el texto lo arma Intl en el idioma activo, no va fijo en el componente.
export function antiguedad(creadoEn: string, ahora: Date, idioma: string): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(creadoEn).getTime()) / 60_000))
  const formato = new Intl.RelativeTimeFormat(idioma, { numeric: 'always', style: 'short' })
  if (minutos < 60) return formato.format(-minutos, 'minute')
  if (minutos < 24 * 60) return formato.format(-Math.floor(minutos / 60), 'hour')
  return formato.format(-Math.floor(minutos / (24 * 60)), 'day')
}

// Fecha completa en la hora de Guatemala, como título de la antigüedad.
export function fechaGuatemala(creadoEn: string, idioma: string): string {
  return new Intl.DateTimeFormat(idioma, { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA }).format(
    new Date(creadoEn),
  )
}
