import type { Knex } from 'knex';
import type {
  CambiosUsuarioInterno,
  FiltroUsuarios,
  NuevoUsuarioInterno,
  UsuarioAdminRepository,
  UsuarioInterno,
} from '../../domain/repositories/usuario-admin-repository';
import type { RolInterno } from '../../domain/usuarios/usuario-interno';
import { traducirDuplicadoUsuario } from './duplicados-usuario';

// pg devuelve los bigint como string.
interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  dpi: string | null;
  rol: RolInterno;
  dependencia_id: string | null;
  activo: boolean;
  tiene_password: boolean;
  bloqueado_hasta: Date | null;
}

function aUsuario(fila: FilaUsuario): UsuarioInterno {
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    email: fila.email,
    telefono: fila.telefono,
    dpi: fila.dpi,
    rol: fila.rol,
    dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
    activo: fila.activo,
    tienePassword: fila.tiene_password,
    bloqueadoHasta: fila.bloqueado_hasta,
  };
}

// %, _ y \ son comodines de LIKE: se buscan como texto.
function patronIlike(busqueda: string): string {
  return `%${busqueda.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

export class KnexUsuarioAdminRepository implements UsuarioAdminRepository {
  constructor(private readonly db: Knex) {}

  // Solo usuarios con rol interno: los vecinos nunca se gestionan aquí.
  private internos() {
    return this.db('usuarios as u').join('roles as r', 'r.id', 'u.rol_id').whereNot('r.nombre', 'vecino');
  }

  private seleccion(consulta: Knex.QueryBuilder): Knex.QueryBuilder {
    return consulta.select(
      'u.id',
      'u.nombre',
      'u.email',
      'u.telefono',
      'u.dpi',
      'r.nombre as rol',
      'u.dependencia_id',
      'u.activo',
      this.db.raw('u.password_hash IS NOT NULL as tiene_password'),
      'u.bloqueado_hasta',
    );
  }

  async listar(filtro: FiltroUsuarios): Promise<{ datos: UsuarioInterno[]; total: number }> {
    const consulta = this.internos();
    if (filtro.rol) {
      consulta.where('r.nombre', filtro.rol);
    }
    if (filtro.dependenciaId !== undefined) {
      consulta.where('u.dependencia_id', filtro.dependenciaId);
    }
    if (filtro.activo !== undefined) {
      consulta.where('u.activo', filtro.activo);
    }
    if (filtro.busqueda) {
      const patron = patronIlike(filtro.busqueda);
      consulta.where((q) => q.whereILike('u.nombre', patron).orWhereILike('u.email', patron));
    }

    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaUsuario[] = await this.seleccion(consulta)
      .orderBy([{ column: 'u.nombre' }, { column: 'u.id' }])
      .limit(filtro.tamano)
      .offset((filtro.pagina - 1) * filtro.tamano);
    return { datos: filas.map(aUsuario), total: Number(total) };
  }

  async obtenerInterno(id: number): Promise<UsuarioInterno | null> {
    const fila: FilaUsuario | undefined = await this.seleccion(this.internos().where('u.id', id)).first();
    return fila ? aUsuario(fila) : null;
  }

  async crear(nuevo: NuevoUsuarioInterno): Promise<UsuarioInterno> {
    let id: string;
    try {
      const [fila] = await this.db('usuarios')
        .insert({
          nombre: nuevo.nombre,
          email: nuevo.email,
          dpi: nuevo.dpi,
          telefono: nuevo.telefono,
          rol_id: this.db('roles').where({ nombre: nuevo.rol }).select('id'),
          dependencia_id: nuevo.dependenciaId,
          activo: true,
          password_hash: null,
        })
        .returning('id');
      id = fila.id;
    } catch (error) {
      traducirDuplicadoUsuario(error);
    }
    return (await this.obtenerInterno(Number(id)))!;
  }

  async actualizar(id: number, cambios: CambiosUsuarioInterno): Promise<UsuarioInterno> {
    const fila: Record<string, unknown> = {};
    if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
    if (cambios.telefono !== undefined) fila.telefono = cambios.telefono;
    if (cambios.rol !== undefined) fila.rol_id = this.db('roles').where({ nombre: cambios.rol }).select('id');
    if (cambios.dependenciaId !== undefined) fila.dependencia_id = cambios.dependenciaId;
    if (cambios.activo !== undefined) fila.activo = cambios.activo;
    if (cambios.desbloquear) {
      fila.intentos_fallidos = 0;
      fila.bloqueado_hasta = null;
    }
    if (Object.keys(fila).length > 0) {
      await this.db('usuarios').where({ id }).update(fila);
    }
    return (await this.obtenerInterno(id))!;
  }

  async contarAdminsActivosParaActualizar(): Promise<number> {
    // FOR UPDATE no admite count(): se bloquean y cuentan las filas.
    const filas = await this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where({ 'r.nombre': 'administrador', 'u.activo': true })
      .forUpdate('u')
      .select('u.id');
    return filas.length;
  }

  async dependenciaActiva(dependenciaId: number): Promise<boolean> {
    const fila = await this.db('dependencias').where({ id: dependenciaId, activa: true }).first('id');
    return fila !== undefined;
  }
}
