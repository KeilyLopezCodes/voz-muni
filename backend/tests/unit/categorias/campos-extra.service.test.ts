import { CamposExtraService } from '../../../src/application/services/campos-extra.service';
import type { CampoExtra } from '../../../src/domain/categorias/campo-extra';
import type { CategoriaAdminRepository } from '../../../src/domain/repositories/categoria-admin-repository';
import type { CategoriaFormulario } from '../../../src/domain/repositories/catalogo-lectura-repository';
import { TransaccionEnMemoria } from '../auth/dobles';

class CategoriasEnMemoria implements CategoriaAdminRepository {
  readonly bloqueadas: number[] = [];

  constructor(
    readonly categorias: Map<number, CategoriaFormulario>,
    readonly conTickets: Set<number>,
  ) {}

  async obtenerParaActualizar(categoriaId: number): Promise<CategoriaFormulario | null> {
    this.bloqueadas.push(categoriaId);
    return this.categorias.get(categoriaId) ?? null;
  }

  async tieneTickets(categoriaId: number): Promise<boolean> {
    return this.conTickets.has(categoriaId);
  }

  async guardarCampos(categoriaId: number, campos: CampoExtra[]): Promise<void> {
    this.categorias.get(categoriaId)!.camposExtra = campos;
  }
}

const NUMERO: CampoExtra = { clave: 'litros', etiqueta: 'Litros', tipo: 'numero', requerido: false, orden: 0, entero: true };
const COMO_TEXTO = { clave: 'litros', etiqueta: 'Litros', tipo: 'texto', requerido: false, orden: 0, max: 10 };

function crear(conTickets: number[] = []) {
  const categorias = new CategoriasEnMemoria(
    new Map([
      [1, { id: 1, nombre: 'Agua potable', camposExtra: [NUMERO] }],
      [2, { id: 2, nombre: 'Baches', camposExtra: [NUMERO] }],
    ]),
    new Set(conTickets),
  );
  const servicio = new CamposExtraService(new TransaccionEnMemoria({ categoriasAdmin: categorias }));
  return { servicio, categorias };
}

describe('CamposExtraService.actualizar', () => {
  it('sin quejas acepta cualquier definición válida, incluso un cambio de tipo', async () => {
    const { servicio, categorias } = crear();

    const resultado = await servicio.actualizar(1, [COMO_TEXTO]);

    expect(resultado).toEqual({ id: 1, nombre: 'Agua potable', camposExtra: [COMO_TEXTO] });
    expect(categorias.categorias.get(1)!.camposExtra).toEqual([COMO_TEXTO]);
    expect(categorias.bloqueadas).toEqual([1]);
  });

  it('con quejas rechaza el cambio de tipo con CAMBIO_INCOMPATIBLE y su detalle, sin guardar', async () => {
    const { servicio, categorias } = crear([1]);

    await expect(servicio.actualizar(1, [COMO_TEXTO])).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'CAMBIO_INCOMPATIBLE',
      detalles: [{ campo: 'litros', problema: 'TIPO_CAMBIADO' }],
    });
    expect(categorias.categorias.get(1)!.camposExtra).toEqual([NUMERO]);
  });

  it('con quejas acepta un cambio compatible (solo la etiqueta)', async () => {
    const { servicio } = crear([1]);

    await expect(servicio.actualizar(1, [{ ...NUMERO, etiqueta: 'Litros perdidos' }])).resolves.toMatchObject({
      camposExtra: [{ etiqueta: 'Litros perdidos' }],
    });
  });

  it('una definición inválida lanza DEFINICION_INVALIDA con detalles, sin tocar la base', async () => {
    const { servicio, categorias } = crear();

    await expect(servicio.actualizar(1, [{ ...COMO_TEXTO, clave: 'Mal' }])).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'DEFINICION_INVALIDA',
      detalles: [{ campo: 'campos[0]', problema: 'CLAVE_INVALIDA' }],
    });
    expect(categorias.bloqueadas).toEqual([]);
  });

  it('una categoría inexistente responde NO_ENCONTRADO', async () => {
    await expect(crear().servicio.actualizar(99, [])).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});
