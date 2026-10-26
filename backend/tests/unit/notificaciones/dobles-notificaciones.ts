import type {
  EventoInterno,
  NotificacionesInternasService,
} from '../../../src/application/services/notificaciones-internas.service';

// Registra los eventos de las notificaciones internas (SPEC 36) sin filtrar destinatarios: los filtros se prueban en
// notificaciones-internas.service.test.ts y contra Postgres en tests/db/notificaciones-internas.test.ts.
export class NotificacionesInternasFalsas implements Pick<NotificacionesInternasService, 'notificar'> {
  readonly eventos: EventoInterno[] = [];

  async notificar(_repos: unknown, evento: EventoInterno): Promise<number> {
    this.eventos.push(evento);
    return 0;
  }

  tipos(): string[] {
    return this.eventos.map((e) => e.tipo);
  }
}
