import type { Clock } from '../../domain/health/clock';
import { retencionValida } from '../../domain/notificaciones/tipos-notificacion';
import type { NotificacionLeida, NotificacionRepository } from '../../domain/repositories/notificacion-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export interface NotificacionDto {
  id: number;
  tipo: string; // TIPOS_NOTIFICACION (SPEC 31, 32 y 36)
  leida: boolean;
  creadoEn: string; // ISO 8601 en UTC
  ticket: { id: number; numero: string; titulo: string } | null;
  datos: Record<string, unknown>;
}

// Cuántas devuelve la campana (SPEC 31). El historial completo llega con RF-32.
export const MAX_NOTIFICACIONES = 20;
export const CLAVE_RETENCION = 'notificaciones_retencion_dias';

const DIA_MS = 24 * 60 * 60 * 1000;

const aDto = ({ creadoEn, ...resto }: NotificacionLeida): NotificacionDto => ({ ...resto, creadoEn: creadoEn.toISOString() });

// Notificaciones del propio usuario (RF-32, SPEC 31). Cada usuario solo accede a las suyas: no hace falta un
// permiso de la matriz. Abrir la queja pasa por GET /tickets/:id, que aplica el alcance (SPEC 11).
export class NotificacionesService {
  constructor(
    private readonly notificaciones: NotificacionRepository,
    private readonly clock: Clock,
    private readonly parametros: ParametroRepository,
    private readonly log: (mensaje: string) => void,
  ) {}

  async listar(usuario: UsuarioAutenticado): Promise<{ datos: NotificacionDto[]; noLeidas: number }> {
    const [datos, noLeidas] = await Promise.all([
      this.notificaciones.listar(usuario.id, MAX_NOTIFICACIONES),
      this.notificaciones.contarNoLeidas(usuario.id),
    ]);
    return { datos: datos.map(aDto), noLeidas };
  }

  // Una de otro usuario responde lo mismo que una inexistente.
  async marcarLeida(usuario: UsuarioAutenticado, id: number): Promise<NotificacionDto> {
    const notificacion = await this.notificaciones.marcarLeida(usuario.id, id, this.clock.now());
    if (!notificacion) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la notificación ${id}`);
    }
    return aDto(notificacion);
  }

  marcarTodasLeidas(usuario: UsuarioAutenticado): Promise<void> {
    return this.notificaciones.marcarTodasLeidas(usuario.id, this.clock.now());
  }

  // Purga diaria del job de correos (SPEC 36): las leídas hace más de notificaciones_retencion_dias días. Con el
  // parámetro inválido no borra nada. El DELETE es idempotente: varias instancias no necesitan coordinarse.
  async purgarLeidas(ahora: Date): Promise<number> {
    const dias = retencionValida(await this.parametros.obtener(CLAVE_RETENCION));
    if (dias === null) {
      this.log(`${CLAVE_RETENCION} falta o no es un entero de 1 a 365; no se purgaron notificaciones`);
      return 0;
    }
    return this.notificaciones.purgarLeidas(new Date(ahora.getTime() - dias * DIA_MS));
  }
}
