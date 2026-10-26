import type { AdjuntoRepository } from './adjunto-repository';
import type { AsignacionRepository } from './asignacion-repository';
import type { CategoriaAdminRepository } from './categoria-admin-repository';
import type { ComentarioRepository } from './comentario-repository';
import type { PoliticaSlaRepository } from './politica-sla-repository';
import type { RegistroVecinoRepository } from './registro-vecino-repository';
import type { RestablecimientoRepository } from './restablecimiento-repository';
import type { SesionRepository } from './sesion-repository';
import type { TicketEscrituraRepository } from './ticket-escritura-repository';
import type { TrasladoRepository } from './traslado-repository';
import type { UsuarioAdminRepository } from './usuario-admin-repository';
import type { UsuarioRepository } from './usuario-repository';
import type { VecinoRepository } from './vecino-repository';

// Repositorios que comparten una misma transacción.
export interface ReposTransaccionales {
  usuarios: UsuarioRepository;
  usuariosAdmin: UsuarioAdminRepository;
  sesiones: SesionRepository;
  restablecimientos: RestablecimientoRepository;
  vecinos: VecinoRepository;
  categoriasAdmin: CategoriaAdminRepository;
  registroVecinos: RegistroVecinoRepository;
  ticketsEscritura: TicketEscrituraRepository;
  asignaciones: AsignacionRepository;
  traslados: TrasladoRepository;
  comentarios: ComentarioRepository;
  adjuntos: AdjuntoRepository;
  politicasSla: PoliticaSlaRepository;
}

// Puerto: ejecuta `trabajo` en una transacción; si lanza, no queda nada escrito.
export interface Transaccion {
  ejecutar<T>(trabajo: (repos: ReposTransaccionales) => Promise<T>): Promise<T>;
}
