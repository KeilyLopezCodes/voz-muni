import type { TokenService } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { UsuarioRepository } from '../../domain/repositories/usuario-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

// Quién hace la petición y qué permite su rol hoy (RF-05).
export class AutorizacionService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async usuarioAutenticado(accessToken: string): Promise<UsuarioAutenticado> {
    const payload = this.tokens.verificarAcceso(accessToken, this.clock.now());
    if (!payload) {
      throw new ErrorDeAplicacion('TOKEN_INVALIDO', 'Token de acceso inválido o vencido');
    }

    // Los permisos se leen en cada petición: un cambio de rol o una desactivación aplica de inmediato.
    const usuario = await this.usuarios.buscarActivo(Number(payload.sub));
    if (!usuario) {
      throw new ErrorDeAplicacion('TOKEN_INVALIDO', 'El usuario del token no existe o está inactivo');
    }
    return usuario;
  }
}
