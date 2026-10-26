import type { PaginaPorAsignar, TicketPorAsignar } from '../../../src/features/tickets/api/asignacion-api'

// Quejas de ejemplo para las pruebas de asignación (SPEC 20).

export function porAsignar(cambios: Partial<TicketPorAsignar> = {}): TicketPorAsignar {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    estado: 'asignada',
    prioridad: 'urgente',
    titulo: 'Bache frente a la escuela',
    categoria: { id: 2, nombre: 'Baches' },
    dependencia: { id: 4, nombre: 'Dirección de Obras' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    tecnico: null,
    creadoEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    sla: { venceRespuesta: null, primeraRespuestaEn: null, venceResolucion: null, pausado: false, restanteMinutosEnPausa: null },
    ...cambios,
  }
}

export function paginaPorAsignar(datos: TicketPorAsignar[], cambios: Partial<PaginaPorAsignar> = {}): PaginaPorAsignar {
  return { datos, pagina: 1, tamano: 20, total: datos.length, ...cambios }
}
