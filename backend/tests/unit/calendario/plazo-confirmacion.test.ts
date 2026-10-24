import { calcularVencimientoConfirmacion, fechaLocal } from '../../../src/domain/calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

// Calendario de noviembre de 2026 con los fines de semana no hábiles, como lo carga seed:dev.
const NOVIEMBRE: { fecha: string; esHabil: boolean }[] = Array.from({ length: 30 }, (_, i) => {
  const fecha = `2026-11-${String(i + 1).padStart(2, '0')}`;
  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return { fecha, esHabil: diaSemana !== 0 && diaSemana !== 6 };
});

// Lo que devuelve CalendarioRepository.diasHabilesPosteriores: hábiles con fecha > desde, en orden.
function habilesPosteriores(desde: string, asuetos: string[] = []): string[] {
  return NOVIEMBRE.filter((d) => d.esHabil && d.fecha > desde && !asuetos.includes(d.fecha)).map((d) => d.fecha);
}

describe('fechaLocal', () => {
  it('una resolución a las 23:30 en Guatemala (05:30 UTC del día siguiente) usa la fecha local', () => {
    expect(fechaLocal(new Date('2026-11-03T05:30:00Z'))).toBe('2026-11-02');
  });

  it('a las 00:00 en Guatemala ya es el día siguiente', () => {
    expect(fechaLocal(new Date('2026-11-03T06:00:00Z'))).toBe('2026-11-03');
  });
});

describe('calcularVencimientoConfirmacion', () => {
  it('resuelta el lunes 2026-11-02 con N = 5 vence el lunes 9 a las 23:59:59.999 en Guatemala', () => {
    const vence = calcularVencimientoConfirmacion(habilesPosteriores('2026-11-02'), 5);

    expect(vence.toISOString()).toBe('2026-11-10T05:59:59.999Z');
  });

  it('el día de la resolución no cuenta aunque sea hábil', () => {
    const dias = habilesPosteriores(fechaLocal(new Date('2026-11-02T15:00:00Z')));

    expect(dias[0]).toBe('2026-11-03');
    expect(calcularVencimientoConfirmacion(dias, 1).toISOString()).toBe('2026-11-04T05:59:59.999Z');
  });

  it('un asueto en medio corre el vencimiento un día hábil', () => {
    const vence = calcularVencimientoConfirmacion(habilesPosteriores('2026-11-02', ['2026-11-04']), 5);

    expect(vence.toISOString()).toBe('2026-11-11T05:59:59.999Z');
  });

  it('una resolución a las 23:30 del lunes en Guatemala cuenta desde el lunes, no desde el martes', () => {
    const resueltoEn = new Date('2026-11-03T05:30:00Z');

    const vence = calcularVencimientoConfirmacion(habilesPosteriores(fechaLocal(resueltoEn)), 5);

    expect(vence.toISOString()).toBe('2026-11-10T05:59:59.999Z');
  });

  it('un día sin fila en el calendario no se cuenta: solo cuentan las fechas hábiles recibidas', () => {
    const conHueco = habilesPosteriores('2026-11-02').filter((d) => d !== '2026-11-05');

    expect(calcularVencimientoConfirmacion(conHueco, 5).toISOString()).toBe('2026-11-11T05:59:59.999Z');
  });

  it('con menos fechas que la cantidad lanza CALENDARIO_INCOMPLETO', () => {
    const dias = ['2026-11-03', '2026-11-04'];

    expect(() => calcularVencimientoConfirmacion(dias, 5)).toThrow(ReglaDeNegocioError);
    expect(() => calcularVencimientoConfirmacion(dias, 5)).toThrow(expect.objectContaining({ codigo: 'CALENDARIO_INCOMPLETO' }));
    expect(() => calcularVencimientoConfirmacion([], 1)).toThrow(expect.objectContaining({ codigo: 'CALENDARIO_INCOMPLETO' }));
  });

  it.each([0, -1, 1.5])('rechaza una cantidad %s', (cantidad) => {
    expect(() => calcularVencimientoConfirmacion(['2026-11-03'], cantidad)).toThrow(RangeError);
  });
});
