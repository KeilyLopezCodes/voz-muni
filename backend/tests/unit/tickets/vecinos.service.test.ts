import {
  enmascararEmail,
  enmascararTelefono,
  MAX_VECINOS_ENCONTRADOS,
  VecinosService,
} from '../../../src/application/services/vecinos.service';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../../src/domain/repositories/vecino-repository';

// Registra el criterio y el límite que recibe; devuelve los vecinos que se le dan.
class VecinosFalsos implements VecinoRepository {
  readonly llamadas: { criterio: CriterioVecino; limite: number }[] = [];

  constructor(private readonly resultado: Vecino[]) {}

  async obtenerActivo(): Promise<Vecino | null> {
    return null;
  }

  async buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]> {
    this.llamadas.push({ criterio, limite });
    return this.resultado.slice(0, limite);
  }
}

describe('enmascarado', () => {
  it('correo: primer carácter, *** y el dominio', () => {
    expect(enmascararEmail('ana.lopez@municipalidad.gt')).toBe('a***@municipalidad.gt');
  });

  it('teléfono: solo los 4 últimos dígitos', () => {
    expect(enmascararTelefono('55550000')).toBe('****0000');
    expect(enmascararTelefono('+502 5555-1234')).toBe('****1234');
  });
});

describe('VecinosService.buscar', () => {
  const vecino: Vecino = { id: 1, nombre: 'Ana', email: 'ana@vozmuni.test', telefono: '55550000' };

  it('enmascara el correo y el teléfono y nunca devuelve el DPI', async () => {
    const servicio = new VecinosService(new VecinosFalsos([{ ...vecino, dpi: '2547123450101' } as Vecino]));

    const { datos } = await servicio.buscar({ email: 'ana@vozmuni.test' });

    expect(datos).toEqual([{ id: 1, nombre: 'Ana', email: 'a***@vozmuni.test', telefono: '****0000' }]);
    expect(JSON.stringify(datos)).not.toContain('2547123450101');
    expect(Object.keys(datos[0])).not.toContain('dpi');
  });

  it('respeta los nulos de contacto', async () => {
    const servicio = new VecinosService(new VecinosFalsos([{ ...vecino, email: null, telefono: null }]));

    expect((await servicio.buscar({ telefono: '55550000' })).datos[0]).toMatchObject({ email: null, telefono: null });
  });

  it('pide como máximo 10 resultados', async () => {
    const repo = new VecinosFalsos(Array.from({ length: 15 }, (_, i) => ({ ...vecino, id: i + 1 })));

    const { datos } = await new VecinosService(repo).buscar({ telefono: '55550000' });

    expect(MAX_VECINOS_ENCONTRADOS).toBe(10);
    expect(datos).toHaveLength(10);
    expect(repo.llamadas[0].limite).toBe(10);
  });

  it('normaliza el correo a minúsculas y el DPI sin espacios', async () => {
    const repo = new VecinosFalsos([]);
    const servicio = new VecinosService(repo);

    await servicio.buscar({ email: 'ANA@VozMuni.test' });
    await servicio.buscar({ dpi: '2547 12345 0101' });

    expect(repo.llamadas.map((l) => l.criterio)).toEqual([{ email: 'ana@vozmuni.test' }, { dpi: '2547123450101' }]);
  });

  it('un DPI que no tiene 13 dígitos → DPI_INVALIDO', async () => {
    await expect(new VecinosService(new VecinosFalsos([])).buscar({ dpi: '123' })).rejects.toMatchObject({
      codigo: 'DPI_INVALIDO',
    });
  });
});
