import { type FiltrosGestion, SIN_ASIGNAR } from '../api/gestion-api'
import { BUSQUEDA_MAX, BUSQUEDA_MIN, ESTADOS_TICKET, type EstadoTicket } from '../api/tickets-api'
import { PRIORIDADES, type Prioridad } from '../api/triage-api'

// Los filtros del listado de gestión viven en la URL (SPEC 45): ?estado=a&estado=b&q=&dependenciaId=&categoriaId=
// &prioridad=&desde=&hasta=&tecnico=&pagina=. Los valores por defecto no se escriben y un valor inválido se ignora.

export const FILTROS_VACIOS: FiltrosGestion = {
  estados: [],
  q: null,
  dependenciaId: null,
  categoriaId: null,
  prioridad: null,
  desde: null,
  hasta: null,
  tecnico: null,
  pagina: 1,
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

// YYYY-MM-DD de un día que existe, como el dominio del backend.
export function esFechaValida(fecha: string): boolean {
  const instante = Date.parse(`${fecha}T00:00:00Z`)
  return FECHA.test(fecha) && !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === fecha
}

function entero(valor: string | null): number | null {
  if (valor === null || !/^\d+$/.test(valor)) {
    return null
  }
  const numero = Number(valor)
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null
}

// Con menos de 2 caracteres la búsqueda no se envía (SPEC 38).
export function busquedaValida(texto: string | null): string | null {
  const recortado = (texto ?? '').trim()
  const largo = [...recortado].length
  return largo >= BUSQUEDA_MIN && largo <= BUSQUEDA_MAX ? recortado : null
}

export function filtrosDesdeUrl(parametros: URLSearchParams): FiltrosGestion {
  const estados = [...new Set(parametros.getAll('estado'))].filter((estado): estado is EstadoTicket =>
    (ESTADOS_TICKET as readonly string[]).includes(estado),
  )
  const prioridad = parametros.get('prioridad')
  const desdeCrudo = parametros.get('desde')
  const hastaCrudo = parametros.get('hasta')
  const desde = desdeCrudo !== null && esFechaValida(desdeCrudo) ? desdeCrudo : null
  const hastaValida = hastaCrudo !== null && esFechaValida(hastaCrudo) ? hastaCrudo : null
  // Un hasta anterior a desde se descarta: el backend lo rechazaría (RANGO_INVALIDO).
  const hasta = hastaValida !== null && desde !== null && hastaValida < desde ? null : hastaValida
  const tecnico = parametros.get('tecnico')
  return {
    estados,
    q: busquedaValida(parametros.get('q')),
    dependenciaId: entero(parametros.get('dependenciaId')),
    categoriaId: entero(parametros.get('categoriaId')),
    prioridad: prioridad !== null && (PRIORIDADES as readonly string[]).includes(prioridad) ? (prioridad as Prioridad) : null,
    desde,
    hasta,
    tecnico: tecnico === SIN_ASIGNAR ? SIN_ASIGNAR : entero(tecnico),
    pagina: entero(parametros.get('pagina')) ?? 1,
  }
}

export function filtrosAUrl(filtros: FiltrosGestion): URLSearchParams {
  const parametros = new URLSearchParams()
  filtros.estados.forEach((estado) => parametros.append('estado', estado))
  const opcionales: [string, string | number | null][] = [
    ['q', filtros.q],
    ['dependenciaId', filtros.dependenciaId],
    ['categoriaId', filtros.categoriaId],
    ['prioridad', filtros.prioridad],
    ['desde', filtros.desde],
    ['hasta', filtros.hasta],
    ['tecnico', filtros.tecnico],
    ['pagina', filtros.pagina === 1 ? null : filtros.pagina],
  ]
  for (const [clave, valor] of opcionales) {
    if (valor !== null) {
      parametros.set(clave, String(valor))
    }
  }
  return parametros
}

// Algún filtro además de la página: decide qué mensaje de vacío se muestra.
export function hayFiltros(filtros: FiltrosGestion): boolean {
  return filtrosAUrl({ ...filtros, pagina: 1 }).toString() !== ''
}
