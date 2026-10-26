import { rangoReportes } from '../../../src/domain/reportes/rango-fechas';

describe('rangoReportes (SPEC 43)', () => {
  it('por defecto son 30 días que terminan hoy en Guatemala', () => {
    expect(rangoReportes(undefined, undefined, '2026-10-30')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-30',
      inicio: new Date('2026-10-01T06:00:00.000Z'),
      fin: new Date('2026-10-31T06:00:00.000Z'),
    });
  });

  it('2026-10-01..2026-10-31 se convierte a [2026-10-01T06:00Z, 2026-11-01T06:00Z)', () => {
    const rango = rangoReportes('2026-10-01', '2026-10-31', '2026-11-15');
    expect(rango.inicio).toEqual(new Date('2026-10-01T06:00:00.000Z'));
    expect(rango.fin).toEqual(new Date('2026-11-01T06:00:00.000Z'));
  });

  it('366 días es el máximo válido', () => {
    expect(rangoReportes('2025-11-01', '2026-11-01', '2026-11-01').desde).toBe('2025-11-01');
  });

  it.each([
    ['367 días', '2025-10-31', '2026-11-01'],
    ['desde > hasta', '2026-11-05', '2026-11-01'],
    ['una fecha que no existe', '2026-02-30', '2026-03-01'],
    ['un formato inválido', '01/10/2026', '2026-10-31'],
  ])('%s → RANGO_INVALIDO', (_caso, desde, hasta) => {
    expect(() => rangoReportes(desde, hasta, '2026-11-01')).toThrow(expect.objectContaining({ codigo: 'RANGO_INVALIDO' }));
  });
});
