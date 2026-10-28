import { ESTADOS_TICKET, type EstadoTicket, esEstadoFinal, type FiltrosConteo, type FiltrosListado } from '../api/tickets-api'
import { type Prioridad, PRIORIDADES } from '../api/triage-api'

// Criterios del listado interno (SPEC 45). Viven en la URL (?estado=&q=&dependenciaId=&categoriaId=&prioridad=&desde=
// &hasta=&escalado=&pagina=), nunca en localStorage ni sessionStorage. Los valores por defecto no se escriben.
export interface CriteriosListadoInterno {
  estados: readonly EstadoTicket[]
  q: string | null
  dependenciaId: number | null
  categoriaId: number | null
  prioridad: Prioridad | null
  desde: string // YYYY-MM-DD, en America/Guatemala
  hasta: string
  escalado: boolean
  pagina: number
}

// Copia de las reglas del backend (domain/reportes/rango-fechas.ts, SPEC 43), que sigue siendo la fuente de verdad.
export const DIAS_POR_DEFECTO = 30
export const RANGO_MAXIMO_DIAS = 366
const BUSQUEDA_MIN = 2
const BUSQUEDA_MAX = 100

// Por defecto, las activas: todos los estados menos los finales.
export const ESTADOS_POR_DEFECTO: readonly EstadoTicket[] = ESTADOS_TICKET.filter((estado) => !esEstadoFinal(estado))

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[1-9]\d{0,15}$/

export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function esFechaValida(fecha: string | null): fecha is string {
  return fecha !== null && FORMATO_FECHA.test(fecha) && sumarDias(fecha, 0) === fecha
}

function diasDelRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1
}

// `hoy` es la fecha local de Guatemala (hoyGuatemala).
export function criteriosPorDefecto(hoy: string): CriteriosListadoInterno {
  return {
    estados: ESTADOS_POR_DEFECTO,
    q: null,
    dependenciaId: null,
    categoriaId: null,
    prioridad: null,
    desde: sumarDias(hoy, -(DIAS_POR_DEFECTO - 1)),
    hasta: hoy,
    escalado: false,
    pagina: 1,
  }
}

const mismosEstados = (a: readonly EstadoTicket[], b: readonly EstadoTicket[]) =>
  a.length === b.length && a.every((estado) => b.includes(estado))

const leerId = (valor: string | null) => (valor !== null && ID.test(valor) ? Number(valor) : null)

// Un valor inválido en la URL se ignora y se usa el valor por defecto. Un rango inválido (fechas mal formadas,
// invertidas o de más de 366 días) vuelve al rango por defecto completo.
export function leerCriterios(parametros: URLSearchParams, hoy: string): CriteriosListadoInterno {
  const base = criteriosPorDefecto(hoy)
  const estados = [...new Set(parametros.getAll('estado'))].filter((estado): estado is EstadoTicket =>
    (ESTADOS_TICKET as readonly string[]).includes(estado),
  )
  const q = parametros.get('q')?.trim() ?? ''
  const prioridad = parametros.get('prioridad')
  const pagina = leerId(parametros.get('pagina'))
  const desdeUrl = parametros.get('desde')
  const hastaUrl = parametros.get('hasta')
  const hasta = esFechaValida(hastaUrl) ? hastaUrl : base.hasta
  const desde = esFechaValida(desdeUrl) ? desdeUrl : sumarDias(hasta, -(DIAS_POR_DEFECTO - 1))
  const dias = diasDelRango(desde, hasta)
  const rangoValido = dias >= 1 && dias <= RANGO_MAXIMO_DIAS
  return {
    estados: estados.length > 0 ? estados : base.estados,
    q: [...q].length >= BUSQUEDA_MIN && [...q].length <= BUSQUEDA_MAX ? q : null,
    dependenciaId: leerId(parametros.get('dependenciaId')),
    categoriaId: leerId(parametros.get('categoriaId')),
    prioridad: (PRIORIDADES as readonly string[]).includes(prioridad ?? '') ? (prioridad as Prioridad) : null,
    desde: rangoValido ? desde : base.desde,
    hasta: rangoValido ? hasta : base.hasta,
    escalado: parametros.get('escalado') === 'true',
    pagina: pagina ?? 1,
  }
}

// Solo lo que difiere del valor por defecto. Los estados se escriben en el orden en que se eligieron.
export function escribirCriterios(criterios: CriteriosListadoInterno, hoy: string): URLSearchParams {
  const base = criteriosPorDefecto(hoy)
  const parametros = new URLSearchParams()
  if (!mismosEstados(criterios.estados, base.estados)) {
    criterios.estados.forEach((estado) => parametros.append('estado', estado))
  }
  if (criterios.q !== null) parametros.set('q', criterios.q)
  if (criterios.dependenciaId !== null) parametros.set('dependenciaId', String(criterios.dependenciaId))
  if (criterios.categoriaId !== null) parametros.set('categoriaId', String(criterios.categoriaId))
  if (criterios.prioridad !== null) parametros.set('prioridad', criterios.prioridad)
  if (criterios.desde !== base.desde || criterios.hasta !== base.hasta) {
    parametros.set('desde', criterios.desde)
    parametros.set('hasta', criterios.hasta)
  }
  if (criterios.escalado) parametros.set('escalado', 'true')
  if (criterios.pagina !== 1) parametros.set('pagina', String(criterios.pagina))
  return parametros
}

// Cambiar cualquier filtro vuelve a la página 1; cambiar solo la página la conserva.
export function conCambio(
  criterios: CriteriosListadoInterno,
  cambio: Partial<CriteriosListadoInterno>,
): CriteriosListadoInterno {
  const soloPagina = Object.keys(cambio).every((clave) => clave === 'pagina')
  return { ...criterios, ...cambio, pagina: soloPagina ? (cambio.pagina ?? criterios.pagina) : 1 }
}

// Lo que se envía a GET /tickets/resumen: los mismos criterios, sin estados ni página.
export function aFiltrosConteo(criterios: CriteriosListadoInterno): FiltrosConteo {
  return {
    q: criterios.q,
    dependenciaId: criterios.dependenciaId,
    categoriaId: criterios.categoriaId,
    prioridad: criterios.prioridad,
    desde: criterios.desde,
    hasta: criterios.hasta,
    escalado: criterios.escalado,
  }
}

// Lo que se envía a GET /tickets. Las fechas siempre van: el valor por defecto de 30 días vive en el frontend.
export function aFiltrosListado(criterios: CriteriosListadoInterno): FiltrosListado {
  return { ...aFiltrosConteo(criterios), estados: criterios.estados, pagina: criterios.pagina }
}
