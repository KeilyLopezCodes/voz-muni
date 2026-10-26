import type { Knex } from 'knex';
import type { TipoZona } from '../../domain/catalogos/zona';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type {
  CambiosCategoria,
  CambiosDependencia,
  CambiosZona,
  CatalogosAdminRepository,
  CategoriaAdmin,
  DependenciaAdmin,
  ZonaAdmin,
} from '../../domain/repositories/catalogos-admin-repository';
import { ESTADOS_FINALES } from '../../domain/ticket/estado-ticket';
import { PRIORIDADES } from '../../domain/ticket/prioridad';

const VIOLACION_UNICA = '23505';

// Los índices de 0033 (lower(nombre)) deciden los duplicados, también entre dos peticiones simultáneas.
async function conNombreUnico<T>(trabajo: () => Promise<T>): Promise<T> {
  try {
    return await trabajo();
  } catch (error) {
    if ((error as { code?: string }).code === VIOLACION_UNICA) {
      throw new ReglaDeNegocioError('NOMBRE_DUPLICADO', 'Ya existe un registro con ese nombre');
    }
    throw error;
  }
}

// Solo las columnas que cambian: undefined no se toca.
function sinIndefinidos(cambios: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(cambios).filter(([, valor]) => valor !== undefined));
}

// pg devuelve los bigint y los count como string.
interface FilaDependencia {
  id: string;
  nombre: string;
  activa: boolean;
  categorias_activas: string;
  usuarios_activos: string;
  quejas_abiertas: string;
}

interface FilaCategoria {
  id: string;
  nombre: string;
  activa: boolean;
  dependencia_id: string;
  dependencia_nombre: string;
  dependencia_activa: boolean;
  campos_extra: string;
  sla_completo: boolean;
}

const aDependencia = (f: FilaDependencia): DependenciaAdmin => ({
  id: Number(f.id),
  nombre: f.nombre,
  activa: f.activa,
  categoriasActivas: Number(f.categorias_activas),
  usuariosActivos: Number(f.usuarios_activos),
  quejasAbiertas: Number(f.quejas_abiertas),
});

const aCategoria = (f: FilaCategoria): CategoriaAdmin => ({
  id: Number(f.id),
  nombre: f.nombre,
  activa: f.activa,
  dependencia: { id: Number(f.dependencia_id), nombre: f.dependencia_nombre, activa: f.dependencia_activa },
  camposExtra: Number(f.campos_extra),
  slaCompleto: f.sla_completo,
});

const aZona = (f: { id: string; nombre: string; tipo: TipoZona; activa: boolean }): ZonaAdmin => ({ ...f, id: Number(f.id) });

export class KnexCatalogosAdminRepository implements CatalogosAdminRepository {
  constructor(private readonly db: Knex) {}

  // ---------- dependencias

  private consultaDependencias(): Knex.QueryBuilder {
    return this.db('dependencias as d').select(
      'd.id',
      'd.nombre',
      'd.activa',
      this.db.raw('(SELECT count(*) FROM categorias c WHERE c.dependencia_id = d.id AND c.activa) as categorias_activas'),
      this.db.raw('(SELECT count(*) FROM usuarios u WHERE u.dependencia_id = d.id AND u.activo) as usuarios_activos'),
      this.db.raw(
        `(SELECT count(*) FROM tickets t WHERE t.dependencia_id = d.id AND t.estado NOT IN (${ESTADOS_FINALES.map(() => '?').join(', ')})) as quejas_abiertas`,
        [...ESTADOS_FINALES],
      ),
    );
  }

  async listarDependencias(): Promise<DependenciaAdmin[]> {
    const filas: FilaDependencia[] = await this.consultaDependencias().orderBy([{ column: 'd.nombre' }, { column: 'd.id' }]);
    return filas.map(aDependencia);
  }

  async dependencia(id: number): Promise<DependenciaAdmin | null> {
    const fila: FilaDependencia | undefined = await this.consultaDependencias().where('d.id', id).first();
    return fila ? aDependencia(fila) : null;
  }

  async bloquearDependencia(id: number): Promise<{ id: number; activa: boolean } | null> {
    const fila: { id: string; activa: boolean } | undefined = await this.db('dependencias')
      .where({ id })
      .forUpdate()
      .first('id', 'activa');
    return fila ? { id: Number(fila.id), activa: fila.activa } : null;
  }

  async dependenciaActiva(id: number): Promise<boolean | null> {
    const fila: { activa: boolean } | undefined = await this.db('dependencias').where({ id }).forShare().first('activa');
    return fila ? fila.activa : null;
  }

  async bloquearCategoriasActivas(dependenciaId: number): Promise<{ id: number; nombre: string }[]> {
    const filas: { id: string; nombre: string }[] = await this.db('categorias')
      .where({ dependencia_id: dependenciaId, activa: true })
      .orderBy('nombre')
      .forUpdate()
      .select('id', 'nombre');
    return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre }));
  }

  crearDependencia(nombre: string): Promise<number> {
    return conNombreUnico(async () => {
      const [fila] = await this.db('dependencias').insert({ nombre, activa: true }).returning('id');
      return Number(fila.id);
    });
  }

  async actualizarDependencia(id: number, cambios: CambiosDependencia): Promise<void> {
    await conNombreUnico(() => this.db('dependencias').where({ id }).update(sinIndefinidos({ ...cambios })));
  }

  // ---------- categorías

  private consultaCategorias(): Knex.QueryBuilder {
    return this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .select(
        'c.id',
        'c.nombre',
        'c.activa',
        'c.dependencia_id',
        'd.nombre as dependencia_nombre',
        'd.activa as dependencia_activa',
        this.db.raw('jsonb_array_length(c.campos_extra) as campos_extra'),
        this.db.raw('(SELECT count(DISTINCT p.prioridad) FROM politicas_sla p WHERE p.categoria_id = c.id) = ? as sla_completo', [
          PRIORIDADES.length,
        ]),
      );
  }

  async listarCategorias(): Promise<CategoriaAdmin[]> {
    const filas: FilaCategoria[] = await this.consultaCategorias().orderBy([{ column: 'c.nombre' }, { column: 'c.id' }]);
    return filas.map(aCategoria);
  }

  async categoria(id: number): Promise<CategoriaAdmin | null> {
    const fila: FilaCategoria | undefined = await this.consultaCategorias().where('c.id', id).first();
    return fila ? aCategoria(fila) : null;
  }

  async bloquearCategoria(id: number): Promise<{ id: number; activa: boolean; dependenciaId: number } | null> {
    const fila: { id: string; activa: boolean; dependencia_id: string } | undefined = await this.db('categorias')
      .where({ id })
      .forUpdate()
      .first('id', 'activa', 'dependencia_id');
    return fila ? { id: Number(fila.id), activa: fila.activa, dependenciaId: Number(fila.dependencia_id) } : null;
  }

  async slaCompleto(categoriaId: number): Promise<boolean> {
    const [{ total }] = await this.db('politicas_sla').where({ categoria_id: categoriaId }).countDistinct({ total: 'prioridad' });
    return Number(total) === PRIORIDADES.length;
  }

  crearCategoria(nombre: string, dependenciaId: number): Promise<number> {
    return conNombreUnico(async () => {
      const [fila] = await this.db('categorias')
        .insert({ nombre, dependencia_id: dependenciaId, activa: false, campos_extra: JSON.stringify([]) })
        .returning('id');
      return Number(fila.id);
    });
  }

  async actualizarCategoria(id: number, { nombre, dependenciaId, activa }: CambiosCategoria): Promise<void> {
    await conNombreUnico(() =>
      this.db('categorias').where({ id }).update(sinIndefinidos({ nombre, dependencia_id: dependenciaId, activa })),
    );
  }

  // ---------- zonas

  async listarZonas(): Promise<ZonaAdmin[]> {
    const filas = await this.db('zonas')
      .select('id', 'nombre', 'tipo', 'activa')
      .orderBy([{ column: 'tipo' }, { column: 'nombre' }, { column: 'id' }]);
    return filas.map(aZona);
  }

  async zona(id: number): Promise<ZonaAdmin | null> {
    const fila = await this.db('zonas').where({ id }).first('id', 'nombre', 'tipo', 'activa');
    return fila ? aZona(fila) : null;
  }

  async bloquearZona(id: number): Promise<{ id: number } | null> {
    const fila: { id: string } | undefined = await this.db('zonas').where({ id }).forUpdate().first('id');
    return fila ? { id: Number(fila.id) } : null;
  }

  crearZona(nombre: string, tipo: TipoZona): Promise<number> {
    return conNombreUnico(async () => {
      const [fila] = await this.db('zonas').insert({ nombre, tipo, activa: true }).returning('id');
      return Number(fila.id);
    });
  }

  async actualizarZona(id: number, cambios: CambiosZona): Promise<void> {
    await conNombreUnico(() => this.db('zonas').where({ id }).update(sinIndefinidos({ ...cambios })));
  }
}
