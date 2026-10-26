import type { AccionBitacora } from '../../domain/auditoria/acciones';
import type { EventoAuditoria } from '../../domain/auditoria/auditoria';
import { calcularCambios } from '../../domain/auditoria/saneamiento';
import type { Ticket } from '../../domain/ticket/ticket';

// Las columnas de una queja que la bitácora compara antes y después de una acción (SPEC 41).
function instantanea(ticket: Ticket): Record<string, unknown> {
  return {
    estado: ticket.estado,
    prioridad: ticket.prioridad,
    dependenciaId: ticket.dependenciaId,
    asignadoA: ticket.asignadoA,
    escalado: ticket.escalado,
    escaladoPor: ticket.escaladoPor,
    resueltoEn: ticket.resueltoEn,
    cerradoEn: ticket.cerradoEn,
    resolucion: ticket.resolucion,
    confirmacionVenceEn: ticket.confirmacionVenceEn,
    reaperturas: ticket.reaperturas,
  };
}

// El evento de una acción sobre una queja. La dependencia es la de después de la acción; si quedó en NULL
// (trasladar, rechazar), la de antes; si nunca tuvo (registrar), NULL.
export function eventoTicket(
  accion: AccionBitacora,
  antes: Ticket | null,
  despues: Ticket,
  usuarioId: number | null,
  datos?: Record<string, unknown>,
): EventoAuditoria {
  return {
    accion,
    entidadId: despues.id,
    usuarioId,
    dependenciaId: despues.dependenciaId ?? antes?.dependenciaId ?? null,
    cambios: calcularCambios(antes ? instantanea(antes) : null, instantanea(despues)),
    datos,
  };
}
