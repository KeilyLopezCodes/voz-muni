import type { PaginaAtencion, TicketAtencion } from '../../../src/features/tickets/api/atencion-api'

// Quejas de ejemplo para las pruebas de atención (SPEC 22).

export function enAtencion(cambios: Partial<TicketAtencion> = {}): TicketAtencion {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    estado: 'asignada',
    prioridad: 'alta',
    titulo: 'Bache frente a la escuela',
    descripcion: 'Hay un bache profundo que daña los vehículos',
    categoria: { id: 2, nombre: 'Baches' },
    dependencia: { id: 4, nombre: 'Dirección de Obras' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20',
    datosExtra: { profundidad_cm: 30, hay_agua: false },
    ubicacion: null,
    tecnico: { id: 30, nombre: 'Luis Técnico' },
    motivoEspera: null,
    trasladoPendiente: false,
    creadoEn: new Date(Date.now() - 5 * 3600_000).toISOString(),
    sla: { venceRespuesta: null, primeraRespuestaEn: null, venceResolucion: null, pausado: false, restanteMinutosEnPausa: null },
    ...cambios,
  }
}

export function paginaAtencion(datos: TicketAtencion[], cambios: Partial<PaginaAtencion> = {}): PaginaAtencion {
  return { datos, pagina: 1, tamano: 20, total: datos.length, ...cambios }
}
