import type { Knex } from 'knex';
import type {
  NuevoRegistro,
  RegistroVecinoRepository,
  UsuariosParaRegistro,
} from '../../domain/repositories/registro-vecino-repository';
import type { UsuarioParaRegistro } from '../../domain/usuarios/registro-vecino';
import { traducirDuplicadoUsuario } from './duplicados-usuario';

interface FilaRegistro {
  id: string; // pg devuelve los bigint como string
  rol: string;
  activo: boolean;
  tiene_password: boolean;
  verificado: boolean;
}

const aUsuario = (fila: FilaRegistro | undefined): UsuarioParaRegistro | null =>
  fila
    ? {
        id: Number(fila.id),
        rol: fila.rol,
        activo: fila.activo,
        tienePassword: fila.tiene_password,
        verificado: fila.verificado,
      }
    : null;

export class KnexRegistroVecinoRepository implements RegistroVecinoRepository {
  constructor(private readonly db: Knex) {}

  private usuarioPara() {
    return this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .select(
        'u.id',
        'r.nombre as rol',
        'u.activo',
        this.db.raw('u.password_hash IS NOT NULL AS tiene_password'),
        this.db.raw('u.correo_verificado_en IS NOT NULL AS verificado'),
      )
      .forUpdate('u');
  }

  async buscarParaRegistro(email: string, dpi: string): Promise<UsuariosParaRegistro> {
    const porCorreo: FilaRegistro | undefined = await this.usuarioPara().whereRaw('lower(u.email) = lower(?)', [email]).first();
    const porDpi: FilaRegistro | undefined = await this.usuarioPara().where('u.dpi', dpi).first();
    return { porCorreo: aUsuario(porCorreo), porDpi: aUsuario(porDpi) };
  }

  async crearPendiente(datos: NuevoRegistro): Promise<{ id: number }> {
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

  async reemplazarPendiente(usuarioId: number, datos: NuevoRegistro): Promise<void> {
    try {
      await this.db('usuarios')
        .where({ id: usuarioId })
        .whereNull('correo_verificado_en')
        .update({ nombre: datos.nombre, dpi: datos.dpi, telefono: datos.telefono, password_hash: datos.passwordHash });
    } catch (error) {
      traducirDuplicadoUsuario(error);
    }
  }

  async marcarVerificado(usuarioId: number, ahora: Date): Promise<void> {
    await this.db('usuarios').where({ id: usuarioId }).whereNull('correo_verificado_en').update({ correo_verificado_en: ahora });
  }
}
