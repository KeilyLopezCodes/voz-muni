import type { PaginaTriage, TicketTriage } from '../../../src/features/tickets/api/triage-api'

// Quejas de ejemplo para las pruebas del triage (SPEC 19).

export function queja(cambios: Partial<TicketTriage> = {}): TicketTriage {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    estado: 'nueva',
    titulo: 'Poste sin luz frente a la escuela',
    descripcion: 'El poste lleva una semana apagado',
    categoria: { id: 1, nombre: 'Alumbrado público' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20',
    canal: 'portal',
    datosExtra: { numero_poste: 'P-123', hay_cables: true, campo_viejo: 'valor' },
    ubicacion: { lat: 14.6, lng: -90.5 },
    solicitanteNombre: 'Ana López',
    creadoEn: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    ...cambios,
  }
}

export function pagina(datos: TicketTriage[], cambios: Partial<PaginaTriage> = {}): PaginaTriage {
  return { datos, pagina: 1, tamano: 20, total: datos.length, ...cambios }
}
