import type { Knex } from 'knex';
import type {
  DatosCuentaVecino,
  RegistroVecinoRepository,
} from '../../domain/repositories/registro-vecino-repository';
import type { UsuarioParaRegistro } from '../../domain/usuarios/registro-vecino';
import { traducirDuplicadoUsuario } from './duplicados-usuario';

interface FilaUsuario {
  id: string; // pg devuelve los bigint como string
  rol: string;
  activo: boolean;
  tiene_password: boolean;
  verificado: boolean;
}

export class KnexRegistroVecinoRepository implements RegistroVecinoRepository {
  constructor(private readonly db: Knex) {}

  private consulta() {
    return this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .select(
        'u.id',
        'r.nombre as rol',
        'u.activo',
        this.db.raw('u.password_hash IS NOT NULL as tiene_password'),
        this.db.raw('u.correo_verificado_en IS NOT NULL as verificado'),
      );
  }

  private aUsuario(fila: FilaUsuario | undefined): UsuarioParaRegistro | null {
    return fila
      ? {
          id: Number(fila.id),
          rol: fila.rol,
          activo: fila.activo,
          tienePassword: fila.tiene_password,
          verificado: fila.verificado,
        }
      : null;
  }

  async buscarPorCorreo(email: string): Promise<UsuarioParaRegistro | null> {
    return this.aUsuario(await this.consulta().whereRaw('lower(u.email) = lower(?)', [email]).forUpdate('u').first());
  }

  async buscarPorDpi(dpi: string): Promise<UsuarioParaRegistro | null> {
    return this.aUsuario(await this.consulta().where('u.dpi', dpi).first());
  }

  async crear(datos: DatosCuentaVecino): Promise<{ id: number }> {
    try {
      const [fila] = await this.db('usuarios')
        .insert({
          nombre: datos.nombre,
          dpi: datos.dpi,
          email: datos.email,
          telefono: datos.telefono,
          password_hash: datos.passwordHash,
          rol_id: this.db('roles').where({ nombre: 'vecino' }).select('id'),
          dependencia_id: null,
          activo: true,
          correo_verificado_en: null,
        })
        .returning('id');
      return { id: Number(fila.id) };
    } catch (error) {
      traducirDuplicadoUsuario(error);
    }
  }

  async reemplazarPendiente(usuarioId: number, datos: Omit<DatosCuentaVecino, 'email'>): Promise<void> {
    try {
      await this.db('usuarios').where({ id: usuarioId }).update({
        nombre: datos.nombre,
        dpi: datos.dpi,
        telefono: datos.telefono,
        password_hash: datos.passwordHash,
      });
    } catch (error) {
      traducirDuplicadoUsuario(error);
    }
  }
}
