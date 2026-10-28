import { rangoCreacion } from '../../../src/domain/ticket/rango-creacion';

describe('rangoCreacion (SPEC 45)', () => {
  it('sin fechas no limita', () => {
    expect(rangoCreacion()).toEqual({ inicio: null, fin: null });
  });

  it('solo desde: desde las 00:00 de Guatemala, sin fin', () => {
    expect(rangoCreacion('2026-10-01')).toEqual({ inicio: new Date('2026-10-01T06:00:00.000Z'), fin: null });
  });

  it('solo hasta: hasta el día siguiente a las 00:00 de Guatemala, sin inicio', () => {
    expect(rangoCreacion(undefined, '2026-10-31')).toEqual({ inicio: null, fin: new Date('2026-11-01T06:00:00.000Z') });
  });

  it('hasta = desde cubre ese día completo en Guatemala', () => {
    expect(rangoCreacion('2026-10-28', '2026-10-28')).toEqual({
      inicio: new Date('2026-10-28T06:00:00.000Z'),
      fin: new Date('2026-10-29T06:00:00.000Z'),
    });
  });

  it('no tiene rango máximo', () => {
    expect(rangoCreacion('2020-01-01', '2026-12-31').inicio).toEqual(new Date('2020-01-01T06:00:00.000Z'));
  });

  it.each([
    ['hasta < desde', '2026-11-05', '2026-11-01'],
    ['una fecha que no existe', '2026-02-30', undefined],
    ['un formato inválido en desde', '01/10/2026', undefined],
    ['un formato inválido en hasta', undefined, '2026-1-1'],
  ])('%s → RANGO_INVALIDO', (_caso, desde, hasta) => {
    expect(() => rangoCreacion(desde, hasta)).toThrow(expect.objectContaining({ codigo: 'RANGO_INVALIDO' }));
  });
});
