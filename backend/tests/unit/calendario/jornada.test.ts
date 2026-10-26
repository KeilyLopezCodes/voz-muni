import { minutosPorJornada, validarJornada } from '../../../src/domain/calendario/jornada';

describe('validarJornada', () => {
  it('08:00–16:00 es válida, con 480 minutos', () => {
    const jornada = validarJornada({ inicio: '08:00', fin: '16:00' });
    expect(jornada).toEqual({ inicio: '08:00', fin: '16:00' });
    expect(minutosPorJornada(jornada)).toBe(480);
  });

  it.each([
    ['fin antes que inicio', { inicio: '16:00', fin: '08:00' }],
    ['fin igual a inicio', { inicio: '08:00', fin: '08:00' }],
    ['una hora sin cero inicial', { inicio: '8:00', fin: '16:00' }],
    ['una hora 25:00', { inicio: '08:00', fin: '25:00' }],
    ['minutos 60', { inicio: '08:60', fin: '16:00' }],
    ['sin fin', { inicio: '08:00' }],
    ['un número', 480],
    ['null', null],
  ])('%s → PARAMETRO_INVALIDO', (_caso, valor) => {
    expect(() => validarJornada(valor)).toThrow(expect.objectContaining({ codigo: 'PARAMETRO_INVALIDO' }));
  });
});
