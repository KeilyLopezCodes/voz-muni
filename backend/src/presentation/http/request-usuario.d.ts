import type { UsuarioAutenticado } from '../../application/dto/auth.dto';
import type { Alcance } from '../../domain/auth/permisos';

// Lo que dejan en la petición `autenticar` (usuario) y `requierePermiso` (alcance).
declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
      alcance?: Alcance;
    }
  }
}

export {};
