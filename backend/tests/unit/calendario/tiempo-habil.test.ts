import type { JornadaLaboral } from '../../../src/domain/calendario/jornada';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../../src/domain/calendario/tiempo-habil';

const JORNADA: JornadaLaboral = { inicio: '08:00', fin: '16:00' };

// Lunes 26 de octubre a viernes 13 de noviembre de 2026, sin fines de semana ni asuetos.
const DIAS = [
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
  '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
  '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
];

// Guatemala está en UTC−6 todo el año: las 15:00 locales son las 21:00 UTC. Solo para armar los datos de prueba.
function gt(fecha: string, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const base = new Date(`${fecha}T00:00:00.000Z`).getTime();
  return new Date(base + ((h + 6) * 60 + m) * 60_000);
}

describe('sumarMinutosHabiles', () => {
  it.each([
    ['lunes 15:00 + 120', gt('2026-10-26', '15:00'), 120, gt('2026-10-27', '09:00')],
    ['viernes 18:00 + 60', gt('2026-10-30', '18:00'), 60, gt('2026-11-02', '09:00')],
    ['lunes 08:00 + 480', gt('2026-10-26', '08:00'), 480, gt('2026-10-26', '16:00')],
  ])('ejemplo de la spec: %s', (_caso, desde, minutos, esperado) => {
    expect(sumarMinutosHabiles(desde, minutos, DIAS, JORNADA)).toEqual(esperado);
  });

  it('un asueto en medio salta al siguiente día hábil', () => {
    const sinMartes = DIAS.filter((d) => d !== '2026-10-27');
    expect(sumarMinutosHabiles(gt('2026-10-26', '15:00'), 120, sinMartes, JORNADA)).toEqual(gt('2026-10-28', '09:00'));
  });

  it('un instante antes de las 08:00 empieza a las 08:00', () => {
    expect(sumarMinutosHabiles(gt('2026-10-26', '06:30'), 30, DIAS, JORNADA)).toEqual(gt('2026-10-26', '08:30'));
  });

  it('terminar justo a las 16:00 devuelve las 16:00', () => {
    expect(sumarMinutosHabiles(gt('2026-10-26', '14:00'), 120, DIAS, JORNADA)).toEqual(gt('2026-10-26', '16:00'));
  });

  it('con 0 minutos devuelve el primer instante hábil', () => {
    expect(sumarMinutosHabiles(gt('2026-10-26', '10:15'), 0, DIAS, JORNADA)).toEqual(gt('2026-10-26', '10:15'));
    expect(sumarMinutosHabiles(gt('2026-10-26', '16:00'), 0, DIAS, JORNADA)).toEqual(gt('2026-10-27', '08:00'));
    expect(sumarMinutosHabiles(gt('2026-10-31', '10:00'), 0, DIAS, JORNADA)).toEqual(gt('2026-11-02', '08:00'));
  });

  it('un instante a las 23:30 en Guatemala usa la fecha local, aunque en UTC ya sea otro día', () => {
    // Lunes 26 a las 23:30 en Guatemala = martes 27 a las 05:30 UTC.
    expect(sumarMinutosHabiles(gt('2026-10-26', '23:30'), 60, DIAS, JORNADA)).toEqual(gt('2026-10-27', '09:00'));
  });

  it('suma varias jornadas', () => {
    expect(sumarMinutosHabiles(gt('2026-10-26', '08:00'), 48 * 60, DIAS, JORNADA)).toEqual(gt('2026-11-02', '16:00'));
  });

  it('con días insuficientes lanza CALENDARIO_INCOMPLETO', () => {
    expect(() => sumarMinutosHabiles(gt('2026-10-26', '08:00'), 481, ['2026-10-26'], JORNADA)).toThrow(
      expect.objectContaining({ codigo: 'CALENDARIO_INCOMPLETO' }),
    );
  });
});

describe('minutosHabilesEntre', () => {
  it('de viernes 15:00 a lunes 09:00 es 120', () => {
    expect(minutosHabilesEntre(gt('2026-10-30', '15:00'), gt('2026-11-02', '09:00'), DIAS, JORNADA)).toBe(120);
  });

  it('de un instante a sí mismo es 0, y al revés también', () => {
    const x = gt('2026-10-26', '10:00');
    expect(minutosHabilesEntre(x, x, DIAS, JORNADA)).toBe(0);
    expect(minutosHabilesEntre(gt('2026-10-27', '10:00'), x, DIAS, JORNADA)).toBe(0);
  });

  it('fuera de la jornada no cuenta', () => {
    expect(minutosHabilesEntre(gt('2026-10-26', '17:00'), gt('2026-10-27', '07:00'), DIAS, JORNADA)).toBe(0);
  });

  it('redondea hacia abajo los segundos', () => {
    const desde = gt('2026-10-26', '10:00');
    expect(minutosHabilesEntre(desde, new Date(desde.getTime() + 90_500), DIAS, JORNADA)).toBe(1);
  });

  it('es la inversa de sumar', () => {
    const desde = gt('2026-10-26', '15:00');
    const hasta = sumarMinutosHabiles(desde, 1000, DIAS, JORNADA);
    expect(minutosHabilesEntre(desde, hasta, DIAS, JORNADA)).toBe(1000);
  });
});
