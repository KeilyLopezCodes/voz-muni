import type { Knex } from 'knex';
import type { EstadoBloqueo } from '../../domain/auth/bloqueo';
import type { Permisos } from '../../domain/auth/permisos';
import type { Rol } from '../../domain/auth/roles';
import type {
  UsuarioActivo,
  UsuarioConCredenciales,
  UsuarioRepository,
} from '../../domain/repositories/usuario-repository';

// pg devuelve los bigint como string.
interface FilaUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  dependencia_id: string | null;
  activo: boolean;
  password_hash: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  correo_verificado_en: Date | null;
  permisos: Permisos;
}

export class KnexUsuarioRepository implements UsuarioRepository {
  constructor(private readonly db: Knex) {}

  private consulta() {
    return this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .select(
        'u.id',
        'u.nombre',
        'r.nombre as rol',
        'u.dependencia_id',
        'u.activo',
        'u.password_hash',
        'u.intentos_fallidos',
        'u.bloqueado_hasta',
        'u.correo_verificado_en',
        'r.permisos',
      );
  }

  async buscarPorEmail(email: string): Promise<UsuarioConCredenciales | null> {
    // Usa el índice único usuarios_email_lower_unique.
    const fila: FilaUsuario | undefined = await this.consulta()
      .whereRaw('lower(u.email) = lower(?)', [email])
      .first();
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      nombre: fila.nombre,
      rol: fila.rol,
      dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
      activo: fila.activo,
      passwordHash: fila.password_hash,
      bloqueo: { intentosFallidos: fila.intentos_fallidos, bloqueadoHasta: fila.bloqueado_hasta },
      correoVerificado: fila.correo_verificado_en !== null,
    };
  }

  async guardarBloqueo(usuarioId: number, estado: EstadoBloqueo): Promise<void> {
    await this.db('usuarios')
      .where({ id: usuarioId })
      .update({ intentos_fallidos: estado.intentosFallidos, bloqueado_hasta: estado.bloqueadoHasta });
  }

  async cambiarPassword(usuarioId: number, passwordHash: string): Promise<void> {
    await this.db('usuarios')
      .where({ id: usuarioId })
      .update({ password_hash: passwordHash, intentos_fallidos: 0, bloqueado_hasta: null });
  }

  async emailDe(usuarioId: number): Promise<string | null> {
    const fila: { email: string | null } | undefined = await this.db('usuarios').where({ id: usuarioId }).first('email');
    return fila?.email ?? null;
  }

  async buscarActivo(usuarioId: number): Promise<UsuarioActivo | null> {
    const fila: FilaUsuario | undefined = await this.consulta()
      .where({ 'u.id': usuarioId, 'u.activo': true })
      .first();
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      nombre: fila.nombre,
      rol: fila.rol,
      dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
      permisos: fila.permisos,
    };
  }
}
