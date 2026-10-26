import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { BitacoraService, codificarCursor, decodificarCursor } from '../../../src/application/services/bitacora.service';
import { CLAVES_ACCIONES } from '../../../src/domain/auditoria/acciones';
import type { FiltroBitacora } from '../../../src/domain/autorizacion/alcance-bitacora';
import type {
  BitacoraLecturaRepository,
  CriteriosBitacora,
  RegistroBitacora,
} from '../../../src/domain/repositories/bitacora-lectura-repository';
import { RelojFalso } from '../auth/dobles';

// 2026-11-10 09:00 en Guatemala (UTC-6).
const AHORA = new Date('2026-11-10T15:00:00.000Z');

const coordinador: UsuarioAutenticado = {
  id: 40,
  nombre: 'Carlos',
  rol: 'coordinador',
  dependenciaId: 4,
  permisos: { 'bitacora.ver': 'dependencia' },
};

function registro(id: number): RegistroBitacora {
  return {
    id,
    creadoEn: new Date(AHORA.getTime() - id * 1000),
    accion: 'ticket.aceptar',
    entidad: 'ticket',
    entidadId: '1',
    ticketNumero: 'Q-2026-000001',
    usuario: null,
    dependencia: { id: 4, nombre: 'Obras' },
    ip: null,
    detalle: {},
  };
}

class BitacoraFalsa implements BitacoraLecturaRepository {
  readonly llamadas: { filtro: FiltroBitacora; criterios: CriteriosBitacora }[] = [];

  constructor(private readonly registros: RegistroBitacora[]) {}

  async listar() {
    return { datos: [], pagina: 1, tamano: 1, total: 0 };
  }

  async consultar(filtro: FiltroBitacora, criterios: CriteriosBitacora): Promise<RegistroBitacora[]> {
    this.llamadas.push({ filtro, criterios });
    return this.registros.slice(0, criterios.limite);
  }
}

const servicio = (repo: BitacoraFalsa) => new BitacoraService(repo, new RelojFalso(AHORA));

describe('BitacoraService', () => {
  it('sin fechas consulta los últimos 7 días de Guatemala, con el filtro de bitacora.ver', async () => {
    const repo = new BitacoraFalsa([]);
    await servicio(repo).consultar(coordinador, { acciones: [] });

    const [{ filtro, criterios }] = repo.llamadas;
    expect(filtro).toEqual([{ campo: 'dependenciaId', valor: 4 }]);
    // Del 2026-11-04 00:00 al 2026-11-11 00:00 en Guatemala.
    expect(criterios.desde).toEqual(new Date('2026-11-04T06:00:00.000Z'));
    expect(criterios.hasta).toEqual(new Date('2026-11-11T06:00:00.000Z'));
    expect(criterios.limite).toBe(51);
  });

  it('pagina con el cursor: pide uno más y devuelve el cursor del último', async () => {
    const repo = new BitacoraFalsa([registro(1), registro(2), registro(3)]);

    const pagina = await servicio(repo).consultar(coordinador, { acciones: [], tamano: 2 });

    expect(pagina.datos.map((r) => r.id)).toEqual([1, 2]);
    expect(decodificarCursor(pagina.siguienteCursor!)).toEqual({ creadoEn: registro(2).creadoEn, id: 2 });

    await servicio(repo).consultar(coordinador, { acciones: [], cursor: pagina.siguienteCursor! });
    expect(repo.llamadas[1].criterios.cursor).toEqual({ creadoEn: registro(2).creadoEn, id: 2 });
  });

  it('el último lote no tiene siguiente cursor', async () => {
    const pagina = await servicio(new BitacoraFalsa([registro(1)])).consultar(coordinador, { acciones: [] });
    expect(pagina.siguienteCursor).toBeNull();
  });

  it.each([
    ['un rango de 93 días', { desde: '2026-08-01', hasta: '2026-11-01' }],
    ['una fecha que no existe', { desde: '2026-02-30', hasta: '2026-03-01' }],
    ['hasta antes que desde', { desde: '2026-11-05', hasta: '2026-11-01' }],
    ['un cursor mal formado', { cursor: 'no-es-un-cursor' }],
  ])('%s → VALIDACION', async (_caso, consulta) => {
    await expect(servicio(new BitacoraFalsa([])).consultar(coordinador, { acciones: [], ...consulta })).rejects.toMatchObject({
      codigo: 'VALIDACION',
    });
  });

  it('92 días incluidos es el máximo válido', async () => {
    await expect(
      servicio(new BitacoraFalsa([])).consultar(coordinador, { acciones: [], desde: '2026-08-02', hasta: '2026-11-01' }),
    ).resolves.toBeDefined();
  });

  it('acciones devuelve el catálogo con su entidad, y el cursor va y vuelve', () => {
    const { datos } = servicio(new BitacoraFalsa([])).acciones();
    expect(datos.map((a) => a.accion)).toEqual(CLAVES_ACCIONES);
    expect(datos.find((a) => a.accion === 'politica_sla.reemplazar')?.entidad).toBe('categoria');
    expect(decodificarCursor(codificarCursor(registro(5)))).toEqual({ creadoEn: registro(5).creadoEn, id: 5 });
  });
});
