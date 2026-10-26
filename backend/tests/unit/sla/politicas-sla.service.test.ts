import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { PoliticasSlaService } from '../../../src/application/services/politicas-sla.service';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../../src/domain/repositories/politica-sla-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import type { MatrizSla, PlazoSla } from '../../../src/domain/sla/politica-sla';
import { AuditoriaEnMemoria, RelojFalso } from '../auth/dobles';

const AHORA = new Date('2026-10-25T18:00:00.000Z');

const ADMIN: UsuarioAutenticado = {
  id: 6,
  nombre: 'Alma Admin',
  rol: 'administrador',
  dependenciaId: null,
  permisos: { 'admin.catalogos': 'si' },
};

const MATRIZ: PlazoSla[] = [
  { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
  { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
  { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
  { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
];

const BACHES: CategoriaConSla = {
  categoria: { id: 4, nombre: 'Baches', activa: true },
  dependencia: { id: 1, nombre: 'Dirección de Obras' },
  plazos: [],
  completa: false,
  actualizadoEn: null,
  actualizadoPor: null,
};

class PoliticasEnMemoria implements PoliticaSlaRepository {
  readonly reemplazos: { categoriaId: number; matriz: MatrizSla; usuarioId: number; ahora: Date }[] = [];

  constructor(private readonly categorias: CategoriaConSla[] = [BACHES]) {}

  async listarPorCategoria(): Promise<CategoriaConSla[]> {
    return this.categorias;
  }

  async obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null> {
    const categoria = this.categorias.find((c) => c.categoria.id === categoriaId);
    if (!categoria) {
      return null;
    }
    const ultimo = this.reemplazos.at(-1);
    return ultimo
      ? {
          ...categoria,
          plazos: [...ultimo.matriz],
          completa: true,
          actualizadoEn: ultimo.ahora,
          actualizadoPor: { id: ultimo.usuarioId, nombre: 'Alma Admin' },
        }
      : categoria;
  }

  async reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<void> {
    this.reemplazos.push({ categoriaId, matriz, usuarioId, ahora });
  }
}

function servicio(repo: PoliticasEnMemoria): PoliticasSlaService {
  const auditoria = new AuditoriaEnMemoria();
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => trabajo({ politicasSla: repo, auditoria } as unknown as ReposTransaccionales),
  };
  return new PoliticasSlaService(repo, transaccion, new RelojFalso(AHORA));
}

describe('PoliticasSlaService', () => {
  it('lista las categorías con actualizadoEn en ISO', async () => {
    const repo = new PoliticasEnMemoria([{ ...BACHES, actualizadoEn: AHORA }]);
    expect(await servicio(repo).listar()).toEqual({ datos: [{ ...BACHES, actualizadoEn: AHORA.toISOString() }] });
  });

  it('una matriz inválida lanza MATRIZ_SLA_INVALIDA con detalles, sin llamar a reemplazar', async () => {
    const repo = new PoliticasEnMemoria();
    const plazos = MATRIZ.map((p) => (p.prioridad === 'alta' ? { ...p, horasResolucion: 80 } : p));
    await expect(servicio(repo).reemplazar(ADMIN, 4, plazos)).rejects.toMatchObject({
      codigo: 'MATRIZ_SLA_INVALIDA',
      detalles: [{ prioridad: 'media', campo: 'horasResolucion', problema: 'NO_MONOTONA' }],
    });
    expect(repo.reemplazos).toEqual([]);
  });

  it('una categoría inexistente lanza NO_ENCONTRADO', async () => {
    const repo = new PoliticasEnMemoria();
    await expect(servicio(repo).reemplazar(ADMIN, 99, MATRIZ)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(repo.reemplazos).toEqual([]);
  });

  it('una matriz válida llama a reemplazar con la matriz ordenada, el usuario y ahora', async () => {
    const repo = new PoliticasEnMemoria();
    const resultado = await servicio(repo).reemplazar(ADMIN, 4, MATRIZ);
    expect(repo.reemplazos).toEqual([{ categoriaId: 4, matriz: [...MATRIZ].reverse(), usuarioId: 6, ahora: AHORA }]);
    expect(resultado).toMatchObject({
      completa: true,
      actualizadoEn: AHORA.toISOString(),
      actualizadoPor: { id: 6, nombre: 'Alma Admin' },
    });
  });
});
