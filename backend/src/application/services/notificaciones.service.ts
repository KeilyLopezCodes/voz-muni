import type { Clock } from '../../domain/health/clock';
import type { NotificacionLeida, NotificacionRepository } from '../../domain/repositories/notificacion-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export interface NotificacionDto extends Omit<NotificacionLeida, 'creadoEn'> {
  creadoEn: string; // ISO 8601 en UTC
}

const LIMITE = 20;
export const CLAVE_RETENCION_NOTIFICACIONES = 'notificaciones_retencion_dias';
const MS_DIA = 24 * 60 * 60 * 1000;

const aDto = ({ creadoEn, ...resto }: NotificacionLeida): NotificacionDto => ({ ...resto, creadoEn: creadoEn.toISOString() });

// La campana de cada usuario (SPEC 31 y 36): solo ve las suyas, así que no hace falta un permiso de la matriz.
export class NotificacionesService {
  constructor(
    private readonly notificaciones: NotificacionRepository,
    private readonly parametros: ParametroRepository,
    private readonly clock: Clock,
  ) {}

  async listar(usuario: UsuarioAutenticado): Promise<{ datos: NotificacionDto[]; noLeidas: number }> {
    const { datos, noLeidas } = await this.notificaciones.listar(usuario.id, LIMITE);
    return { datos: datos.map(aDto), noLeidas };
  }

  async marcarLeida(usuario: UsuarioAutenticado, id: number): Promise<NotificacionDto> {
    const notificacion = await this.notificaciones.marcarLeida(id, usuario.id, this.clock.now());
    if (!notificacion) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la notificación ${id}`);
    }
    return aDto(notificacion);
  }

  marcarTodas(usuario: UsuarioAutenticado): Promise<void> {
    return this.notificaciones.marcarTodas(usuario.id, this.clock.now());
  }

  // Purga diaria de las leídas con más de notificaciones_retencion_dias días (SPEC 36). Sin parámetro válido, 30.
  async purgar(ahora: Date): Promise<number> {
    const valor = await this.parametros.obtener(CLAVE_RETENCION_NOTIFICACIONES);
    const dias = typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? valor : 30;
    return this.notificaciones.purgarLeidas(new Date(ahora.getTime() - dias * MS_DIA));
  }
}
