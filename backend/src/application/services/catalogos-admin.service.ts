import { exigirActivable, exigirDependenciaActiva } from '../../domain/catalogos/categoria';
import { exigirDesactivable } from '../../domain/catalogos/dependencia';
import { normalizarNombre } from '../../domain/catalogos/nombre';
import type { TipoZona } from '../../domain/catalogos/zona';
import type {
  CambiosCategoria,
  CambiosDependencia,
  CambiosZona,
  CatalogosAdminRepository,
  CategoriaAdmin,
  DependenciaAdmin,
  ZonaAdmin,
} from '../../domain/repositories/catalogos-admin-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

const noEncontrado = (que: string, id: number) => new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la ${que} ${id}`);

const nombreOpcional = (nombre: string | undefined) => (nombre === undefined ? undefined : normalizarNombre(nombre));

// Dependencias, categorías y zonas (RF-41, SPEC 40). Solo se crean, se editan y se desactivan: nunca se borran,
// porque las quejas históricas las referencian. La regla de asignación es "la categoría define la dependencia"
// (SPEC 19): cambiarla solo afecta a las aceptaciones posteriores, nunca a tickets ya guardados.
export class CatalogosAdminService {
  constructor(private readonly transaccion: Transaccion) {}

  // ---------- dependencias

  listarDependencias(): Promise<{ datos: DependenciaAdmin[] }> {
    return this.transaccion.ejecutar(async ({ catalogosAdmin }) => ({ datos: await catalogosAdmin.listarDependencias() }));
  }

  crearDependencia(nombre: string): Promise<DependenciaAdmin> {
    return this.escribir(async (repo) => {
      const id = await repo.crearDependencia(normalizarNombre(nombre));
      return (await repo.dependencia(id))!;
    });
  }

  // Desactivar con categorías activas responde DEPENDENCIA_EN_USO. Los usuarios y las quejas abiertas no lo impiden:
  // las quejas siguen su curso y los usuarios conservan su dependencia.
  editarDependencia(id: number, cambios: CambiosDependencia): Promise<DependenciaAdmin> {
    return this.escribir(async (repo) => {
      const actual = await repo.bloquearDependencia(id);
      if (!actual) {
        throw noEncontrado('dependencia', id);
      }
      if (cambios.activa === false && actual.activa) {
        // Con sus categorías bloqueadas: nadie activa una mientras se decide.
        exigirDesactivable(await repo.bloquearCategoriasActivas(id));
      }
      await repo.actualizarDependencia(id, { nombre: nombreOpcional(cambios.nombre), activa: cambios.activa });
      return (await repo.dependencia(id))!;
    });
  }

  // ---------- categorías

  listarCategorias(): Promise<{ datos: CategoriaAdmin[] }> {
    return this.transaccion.ejecutar(async ({ catalogosAdmin }) => ({ datos: await catalogosAdmin.listarCategorias() }));
  }

  // Nace inactiva y sin campos adicionales: se activa cuando tenga su matriz de SLA (SPEC 29).
  crearCategoria(nombre: string, dependenciaId: number): Promise<CategoriaAdmin> {
    return this.escribir(async (repo) => {
      const normalizado = normalizarNombre(nombre);
      await this.exigirDependencia(repo, dependenciaId);
      const id = await repo.crearCategoria(normalizado, dependenciaId);
      return (await repo.categoria(id))!;
    });
  }

  editarCategoria(id: number, cambios: CambiosCategoria): Promise<CategoriaAdmin> {
    return this.escribir(async (repo) => {
      const nombre = nombreOpcional(cambios.nombre);
      const actual = await repo.bloquearCategoria(id);
      if (!actual) {
        throw noEncontrado('categoría', id);
      }
      // Mover: la dependencia nueva debe existir y estar activa. Las quejas ya aceptadas no se tocan.
      if (cambios.dependenciaId !== undefined && cambios.dependenciaId !== actual.dependenciaId) {
        await this.exigirDependencia(repo, cambios.dependenciaId);
      }
      if (cambios.activa === true && !actual.activa) {
        const dependenciaActiva = await repo.dependenciaActiva(cambios.dependenciaId ?? actual.dependenciaId);
        exigirActivable(await repo.slaCompleto(id), dependenciaActiva === true);
      }
      await repo.actualizarCategoria(id, { nombre, dependenciaId: cambios.dependenciaId, activa: cambios.activa });
      return (await repo.categoria(id))!;
    });
  }

  // ---------- zonas

  listarZonas(): Promise<{ datos: ZonaAdmin[] }> {
    return this.transaccion.ejecutar(async ({ catalogosAdmin }) => ({ datos: await catalogosAdmin.listarZonas() }));
  }

  crearZona(nombre: string, tipo: TipoZona): Promise<ZonaAdmin> {
    return this.escribir(async (repo) => {
      const id = await repo.crearZona(normalizarNombre(nombre), tipo);
      return (await repo.zona(id))!;
    });
  }

  // Desactivar una zona la oculta del registro (SPEC 12 y 14); las quejas que ya la tienen no cambian.
  editarZona(id: number, cambios: CambiosZona): Promise<ZonaAdmin> {
    return this.escribir(async (repo) => {
      if (!(await repo.bloquearZona(id))) {
        throw noEncontrado('zona', id);
      }
      await repo.actualizarZona(id, { nombre: nombreOpcional(cambios.nombre), tipo: cambios.tipo, activa: cambios.activa });
      return (await repo.zona(id))!;
    });
  }

  // ---------- comunes

  // La dependencia debe existir y estar activa; FOR SHARE para que no se desactive en medio (la desactivación la
  // bloquea con FOR UPDATE).
  private async exigirDependencia(repo: CatalogosAdminRepository, dependenciaId: number): Promise<void> {
    const activa = await repo.dependenciaActiva(dependenciaId);
    if (activa === null) {
      throw new ErrorDeAplicacion('DEPENDENCIA_INVALIDA', `No existe la dependencia ${dependenciaId}`);
    }
    exigirDependenciaActiva(activa);
  }

  private escribir<T>(trabajo: (repo: CatalogosAdminRepository) => Promise<T>): Promise<T> {
    return conReglasDeNegocio(() => this.transaccion.ejecutar(({ catalogosAdmin }) => trabajo(catalogosAdmin)));
  }
}
