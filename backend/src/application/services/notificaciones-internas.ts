import { puedeAccederTicket } from '../../domain/autorizacion/alcance-tickets';
import type { DestinatariosRepository } from '../../domain/repositories/destinatarios-repository';
import type { NotificacionRepository, TipoNotificacion } from '../../domain/repositories/notificacion-repository';

export interface EventoInterno {
  tipo: TipoNotificacion;
  ticketId: number;
  autorId: number | null; // nunca se le notifica
  candidatos: readonly (number | null)[]; // los grupos que eligió el caso de uso
  datos?: Record<string, unknown>;
  requiereComentariosInternos?: boolean; // notas internas
  ahora: Date;
  agruparComentario?: { interno: boolean }; // comentario_nuevo se agrupa por queja (SPEC 36)
}

interface Repos {
  notificaciones: NotificacionRepository;
  destinatarios: DestinatariosRepository;
}

// Notifica dentro de la transacción del caso de uso (RF-32, SPEC 36). Filtra, en orden: duplicados y el autor, los
// inactivos, quien no tiene la queja en el alcance de tickets.ver (la misma regla de GET /tickets/:id) y, para las
// notas internas, quien no tiene comentarios.interno. Devuelve a cuántos notificó.
export async function notificarInternos(evento: EventoInterno, repos: Repos): Promise<number> {
  const ids = [...new Set(evento.candidatos.filter((id): id is number => id !== null && id !== evento.autorId))];
  if (ids.length === 0) {
    return 0;
  }
  const ticket = await repos.destinatarios.ticket(evento.ticketId);
  if (!ticket) {
    return 0;
  }
  const destinatarios = (await repos.destinatarios.activos(ids)).filter(
    (usuario) =>
      puedeAccederTicket(usuario, 'tickets.ver', ticket) &&
      (!evento.requiereComentariosInternos || usuario.permisos['comentarios.interno'] !== undefined),
  );
  if (evento.agruparComentario) {
    for (const usuario of destinatarios) {
      await repos.notificaciones.agruparComentario(usuario.id, evento.ticketId, evento.agruparComentario.interno, evento.ahora);
    }
  } else {
    await repos.notificaciones.crear(
      destinatarios.map((usuario) => ({
        usuarioId: usuario.id,
        ticketId: evento.ticketId,
        tipo: evento.tipo,
        datos: evento.datos ?? {},
        creadoEn: evento.ahora,
      })),
    );
  }
  return destinatarios.length;
}
