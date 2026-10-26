import { CatalogosAdminService } from '../../../src/application/services/catalogos-admin.service';
import type { TipoZona } from '../../../src/domain/catalogos/zona';
import type {
  CambiosCategoria,
  CambiosDependencia,
  CambiosZona,
  CatalogosAdminRepository,
  CategoriaAdmin,
  DependenciaAdmin,
  ZonaAdmin,
} from '../../../src/domain/repositories/catalogos-admin-repository';
import { TransaccionEnMemoria } from '../auth/dobles';

interface Dep {
  id: number;
  nombre: string;
  activa: boolean;
}
interface Cat {
  id: number;
  nombre: string;
  activa: boolean;
  dependenciaId: number;
  sla: boolean;
}

// Lo justo para las ramas del servicio; los duplicados y los contadores se prueban contra Postgres.
class CatalogosEnMemoria implements CatalogosAdminRepository {
  readonly dependencias: Dep[] = [
    { id: 1, nombre: 'Obras', activa: true },
    { id: 2, nombre: 'Agua', activa: true },
    { id: 3, nombre: 'Cerrada', activa: false },
  ];
  readonly categorias: Cat[] = [
    { id: 10, nombre: 'Baches', activa: true, dependenciaId: 1, sla: true },
    { id: 11, nombre: 'Banquetas', activa: false, dependenciaId: 1, sla: false },
  ];
  readonly zonas: ZonaAdmin[] = [{ id: 20, nombre: 'Zona 1', tipo: 'zona', activa: true }];
  readonly bloqueos: string[] = [];

  async listarDependencias(): Promise<DependenciaAdmin[]> {
    return Promise.all(this.dependencias.map(async (d) => (await this.dependencia(d.id))!));
  }
  async dependencia(id: number): Promise<DependenciaAdmin | null> {
    const d = this.dependencias.find((x) => x.id === id);
    return d ? { ...d, categoriasActivas: this.categorias.filter((c) => c.dependenciaId === id && c.activa).length, usuariosActivos: 0, quejasAbiertas: 0 } : null;
  }
  async bloquearDependencia(id: number) {
    this.bloqueos.push(`dependencia:${id}`);
    const d = this.dependencias.find((x) => x.id === id);
    return d ? { id: d.id, activa: d.activa } : null;
  }
  async dependenciaActiva(id: number) {
    return this.dependencias.find((x) => x.id === id)?.activa ?? null;
  }
  async bloquearCategoriasActivas(dependenciaId: number) {
    this.bloqueos.push(`categorias:${dependenciaId}`);
    return this.categorias.filter((c) => c.dependenciaId === dependenciaId && c.activa).map(({ id, nombre }) => ({ id, nombre }));
  }
  async crearDependencia(nombre: string) {
    const id = this.dependencias.length + 100;
    this.dependencias.push({ id, nombre, activa: true });
    return id;
  }
  async actualizarDependencia(id: number, cambios: CambiosDependencia) {
    const d = this.dependencias.find((x) => x.id === id)!;
    if (cambios.nombre !== undefined) d.nombre = cambios.nombre;
    if (cambios.activa !== undefined) d.activa = cambios.activa;
  }
  async listarCategorias(): Promise<CategoriaAdmin[]> {
    return Promise.all(this.categorias.map(async (c) => (await this.categoria(c.id))!));
  }
  async categoria(id: number): Promise<CategoriaAdmin | null> {
    const c = this.categorias.find((x) => x.id === id);
    if (!c) return null;
    const d = this.dependencias.find((x) => x.id === c.dependenciaId)!;
    return { id: c.id, nombre: c.nombre, activa: c.activa, dependencia: { ...d }, camposExtra: 0, slaCompleto: c.sla };
  }
  async bloquearCategoria(id: number) {
    const c = this.categorias.find((x) => x.id === id);
    return c ? { id: c.id, activa: c.activa, dependenciaId: c.dependenciaId } : null;
  }
  async slaCompleto(id: number) {
    return this.categorias.find((x) => x.id === id)!.sla;
  }
  async crearCategoria(nombre: string, dependenciaId: number) {
    const id = this.categorias.length + 100;
    this.categorias.push({ id, nombre, activa: false, dependenciaId, sla: false });
    return id;
  }
  async actualizarCategoria(id: number, cambios: CambiosCategoria) {
    const c = this.categorias.find((x) => x.id === id)!;
    if (cambios.nombre !== undefined) c.nombre = cambios.nombre;
    if (cambios.dependenciaId !== undefined) c.dependenciaId = cambios.dependenciaId;
    if (cambios.activa !== undefined) c.activa = cambios.activa;
  }
  async listarZonas() {
    return this.zonas;
  }
  async zona(id: number) {
    return this.zonas.find((z) => z.id === id) ?? null;
  }
  async bloquearZona(id: number) {
    return this.zonas.some((z) => z.id === id) ? { id } : null;
  }
  async crearZona(nombre: string, tipo: TipoZona) {
    const id = this.zonas.length + 100;
    this.zonas.push({ id, nombre, tipo, activa: true });
    return id;
  }
  async actualizarZona(id: number, cambios: CambiosZona) {
    Object.assign(this.zonas.find((z) => z.id === id)!, Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)));
  }
}

function armar() {
  const repo = new CatalogosEnMemoria();
  return { repo, servicio: new CatalogosAdminService(new TransaccionEnMemoria({ catalogosAdmin: repo })) };
}

const codigo = (promesa: Promise<unknown>) => promesa.then(() => null, (e: { codigo: string }) => e.codigo);

describe('CatalogosAdminService', () => {
  it('normaliza los nombres al crear y al renombrar', async () => {
    const { servicio } = armar();
    expect((await servicio.crearDependencia(1, '  Dirección   de Parques ')).nombre).toBe('Dirección de Parques');
    expect((await servicio.editarZona(1, 20, { nombre: ' Zona   Uno ' })).nombre).toBe('Zona Uno');
    expect(await codigo(servicio.crearZona(1, '  ', 'zona'))).toBe('NOMBRE_INVALIDO');
  });

  it('desactivar una dependencia bloquea sus categorías activas y responde DEPENDENCIA_EN_USO si las hay', async () => {
    const { repo, servicio } = armar();
    expect(await codigo(servicio.editarDependencia(1, 1, { activa: false }))).toBe('DEPENDENCIA_EN_USO');
    expect(repo.bloqueos).toEqual(['dependencia:1', 'categorias:1']);
    expect((await servicio.editarDependencia(1, 2, { activa: false })).activa).toBe(false);
  });

  it('una categoría nace inactiva; activar sin SLA → SLA_INCOMPLETO; con la dependencia inactiva → DEPENDENCIA_INACTIVA', async () => {
    const { repo, servicio } = armar();
    expect((await servicio.crearCategoria(1, 'Fugas', 2)).activa).toBe(false);
    expect(await codigo(servicio.crearCategoria(1, 'Otra', 3))).toBe('DEPENDENCIA_INACTIVA');
    expect(await codigo(servicio.crearCategoria(1, 'Otra', 99))).toBe('DEPENDENCIA_INVALIDA');
    expect(await codigo(servicio.editarCategoria(1, 11, { activa: true }))).toBe('SLA_INCOMPLETO');
    repo.categorias[1].sla = true;
    expect(await codigo(servicio.editarCategoria(1, 11, { activa: true, dependenciaId: 3 }))).toBe('DEPENDENCIA_INACTIVA');
    expect((await servicio.editarCategoria(1, 11, { activa: true })).activa).toBe(true);
  });

  it('mover una categoría exige la dependencia nueva activa', async () => {
    const { servicio } = armar();
    expect(await codigo(servicio.editarCategoria(1, 10, { dependenciaId: 3 }))).toBe('DEPENDENCIA_INACTIVA');
    expect((await servicio.editarCategoria(1, 10, { dependenciaId: 2 })).dependencia.id).toBe(2);
  });

  it('un id inexistente → NO_ENCONTRADO', async () => {
    const { servicio } = armar();
    expect(await codigo(servicio.editarDependencia(1, 99, { nombre: 'X' }))).toBe('NO_ENCONTRADO');
    expect(await codigo(servicio.editarCategoria(1, 99, { nombre: 'X' }))).toBe('NO_ENCONTRADO');
    expect(await codigo(servicio.editarZona(1, 99, { nombre: 'X' }))).toBe('NO_ENCONTRADO');
  });
});
