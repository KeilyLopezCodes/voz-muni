import type { RestablecimientoRepository } from './restablecimiento-repository';
import type { SesionRepository } from './sesion-repository';
import type { UsuarioAdminRepository } from './usuario-admin-repository';
import type { UsuarioRepository } from './usuario-repository';

// Repositorios que comparten una misma transacción.
export interface ReposTransaccionales {
  usuarios: UsuarioRepository;
  usuariosAdmin: UsuarioAdminRepository;
  sesiones: SesionRepository;
  restablecimientos: RestablecimientoRepository;
}

// Puerto: ejecuta `trabajo` en una transacción; si lanza, no queda nada escrito.
export interface Transaccion {
  ejecutar<T>(trabajo: (repos: ReposTransaccionales) => Promise<T>): Promise<T>;
}
