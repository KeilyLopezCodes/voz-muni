import type { EstadoTicket } from '../api/tickets-api'

// Los grupos de estados que ve el vecino en "Mis quejas" (RF-36, SPEC 38). Solo existen en el frontend: el backend
// recibe los estados del grupo como `estado`.
export const GRUPOS_VECINO = {
  todas: [], // sin filtro
  respuesta: ['en_espera'],
  en_curso: ['nueva', 'en_revision', 'asignada', 'en_proceso'],
  por_confirmar: ['resuelta'],
  finalizadas: ['cerrada', 'rechazada'],
} as const satisfies Record<string, readonly EstadoTicket[]>

export type GrupoVecino = keyof typeof GRUPOS_VECINO

export const ORDEN_GRUPOS = Object.keys(GRUPOS_VECINO) as GrupoVecino[]

export const GRUPO_POR_DEFECTO: GrupoVecino = 'todas'

// Un grupo desconocido (por ejemplo, en una URL editada a mano) se trata como "todas".
export function grupoDesde(valor: string | null): GrupoVecino {
  return valor !== null && (ORDEN_GRUPOS as string[]).includes(valor) ? (valor as GrupoVecino) : GRUPO_POR_DEFECTO
}

export function estadosDelGrupo(grupo: GrupoVecino): readonly EstadoTicket[] {
  return GRUPOS_VECINO[grupo]
}

// El contador de "todas" es el total; el de los demás, la suma de sus estados.
export function contarGrupo(grupo: GrupoVecino, resumen: { porEstado: Record<EstadoTicket, number>; total: number }): number {
  if (grupo === 'todas') {
    return resumen.total
  }
  return GRUPOS_VECINO[grupo].reduce((suma: number, estado: EstadoTicket) => suma + (resumen.porEstado[estado] ?? 0), 0)
}
