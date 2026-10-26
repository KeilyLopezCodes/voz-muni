import { puedeAccederTicket } from '../../domain/autorizacion/alcance-tickets';
import type { TipoNotificacionInterna } from '../../domain/notificaciones/tipos-notificacion';
import type { ReposTransaccionales } from '../../domain/repositories/transaccion';

// A quién podría ir un evento, por grupos (SPEC 36). Los grupos dependen de permisos y alcances, nunca del nombre del
// rol: ver DestinatariosRepository.
export interface Candidatos {
  usuarios?: readonly (number | null)[]; // ids puntuales: el técnico asignado, el solicitante de un traslado…
  coordinadoresDe?: number | null; // los coordinadores de esta dependencia
  supervisores?: boolean; // quienes tienen tickets.triage
  participantes?: boolean; // los internos que ya comentaron la queja
}

export interface EventoInterno {
  tipo: TipoNotificacionInterna;
  ticketId: number;
  autorId: number | null; // nunca se le notifica
  candidatos: Candidatos;
  datos: Record<string, unknown>; // en comentario_nuevo lo arma el repositorio al agrupar
  requiereComentariosInternos?: boolean; // notas internas
}

type ReposNotificacion = Pick<ReposTransaccionales, 'destinatarios' | 'notificaciones'>;

// Notificaciones a los usuarios internos (RF-32, SPEC 36). Se llama dentro de la transacción del caso de uso: si se
// revierte, no queda notificación, y un error al notificar revierte el caso de uso (es la misma base, no un canal
// externo). Lo que lee ve el estado de esta transacción: quien gana la queja se notifica después del cambio, y quien
// la pierde (técnico reasignado, traslado aprobado), antes.
export class NotificacionesInternasService {
  // Devuelve a cuántos usuarios notificó.
  async notificar(repos: ReposNotificacion, evento: EventoInterno, ahora: Date): Promise<number> {
    const destinatarios = await this.filtrar(repos, evento);
    if (evento.tipo === 'comentario_nuevo') {
      for (const usuarioId of destinatarios) {
        await repos.notificaciones.agruparComentario(usuarioId, evento.ticketId, evento.requiereComentariosInternos === true, ahora);
      }
    } else {
      await repos.notificaciones.crear(
        destinatarios.map((usuarioId) => ({
          usuarioId,
          ticketId: evento.ticketId,
          tipo: evento.tipo,
          datos: evento.datos,
          creadoEn: ahora,
        })),
      );
    }
    return destinatarios.length;
  }

  // 1. Sin duplicados ni el autor. 2. Solo activos. 3. Solo quien tiene la queja en su alcance de tickets.ver (la
  // regla de SPEC 11, la misma de GET /tickets/:id). 4. Notas internas, solo con comentarios.interno.
  private async filtrar({ destinatarios: grupos }: ReposNotificacion, evento: EventoInterno): Promise<number[]> {
    const { candidatos } = evento;
    const ids = new Set<number>();
    const agregar = (lista: readonly (number | null)[]) => lista.forEach((id) => id !== null && ids.add(id));
    agregar(candidatos.usuarios ?? []);
    if (candidatos.coordinadoresDe !== undefined && candidatos.coordinadoresDe !== null) {
      agregar(await grupos.coordinadores(candidatos.coordinadoresDe));
    }
    if (candidatos.supervisores) {
      agregar(await grupos.supervisores());
    }
    if (candidatos.participantes) {
      agregar(await grupos.participantes(evento.ticketId));
    }
    if (evento.autorId !== null) {
      ids.delete(evento.autorId);
    }
    if (ids.size === 0) {
      return [];
    }
    const ticket = await grupos.alcanceTicket(evento.ticketId);
    if (!ticket) {
      return [];
    }
    const usuarios = await grupos.usuarios([...ids]);
    return usuarios
      .filter((u) => u.activo)
      .filter((u) => puedeAccederTicket(u, 'tickets.ver', ticket))
      .filter((u) => !evento.requiereComentariosInternos || u.permisos['comentarios.interno'] !== undefined)
      .map((u) => u.id)
      .sort((a, b) => a - b);
  }
}
