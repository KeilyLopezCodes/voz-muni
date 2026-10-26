import type { NotificacionLeida, NotificacionRepository } from '../../domain/repositories/notificacion-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export interface NotificacionDto {
  id: number;
  tipo: string; // 'sla_alerta_respuesta' | 'sla_alerta_resolucion' por ahora
  leida: boolean;
  creadoEn: string; // ISO 8601 en UTC
  ticket: { id: number; numero: string; titulo: string } | null;
  datos: Record<string, unknown>;
}

// Cuántas devuelve la campana (SPEC 31). El historial completo llega con RF-32.
export const MAX_NOTIFICACIONES = 20;

const aDto = ({ creadoEn, ...resto }: NotificacionLeida): NotificacionDto => ({ ...resto, creadoEn: creadoEn.toISOString() });

// Notificaciones del propio usuario (RF-32, SPEC 31). Cada usuario solo accede a las suyas: no hace falta un
// permiso de la matriz. Abrir la queja pasa por GET /tickets/:id, que aplica el alcance (SPEC 11).
export class NotificacionesService {
  constructor(private readonly notificaciones: NotificacionRepository) {}

  async listar(usuario: UsuarioAutenticado): Promise<{ datos: NotificacionDto[]; noLeidas: number }> {
    const [datos, noLeidas] = await Promise.all([
      this.notificaciones.listar(usuario.id, MAX_NOTIFICACIONES),
      this.notificaciones.contarNoLeidas(usuario.id),
    ]);
    return { datos: datos.map(aDto), noLeidas };
  }

  // Una de otro usuario responde lo mismo que una inexistente.
  async marcarLeida(usuario: UsuarioAutenticado, id: number): Promise<NotificacionDto> {
    const notificacion = await this.notificaciones.marcarLeida(usuario.id, id);
    if (!notificacion) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la notificación ${id}`);
    }
    return aDto(notificacion);
  }

  marcarTodasLeidas(usuario: UsuarioAutenticado): Promise<void> {
    return this.notificaciones.marcarTodasLeidas(usuario.id);
  }
}
