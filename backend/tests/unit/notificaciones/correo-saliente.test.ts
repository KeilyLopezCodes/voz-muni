import { debeDescartarse, MAX_INTENTOS, proximoIntento } from '../../../src/domain/notificaciones/correo-saliente';

const AHORA = new Date('2026-11-02T15:00:00.000Z');
const minutos = (n: number) => new Date(AHORA.getTime() + n * 60_000);

describe('proximoIntento', () => {
  it('después del intento 1 el próximo es a los 5 min', () => {
    expect(proximoIntento(1, AHORA)).toEqual(minutos(5));
  });

  it('después del intento 2, a los 30 min', () => {
    expect(proximoIntento(2, AHORA)).toEqual(minutos(30));
  });

  it(`después del intento ${MAX_INTENTOS} no quedan intentos`, () => {
    expect(proximoIntento(3, AHORA)).toBeNull();
    expect(proximoIntento(4, AHORA)).toBeNull();
  });
});

describe('debeDescartarse', () => {
  it('es true solo si expiraEn es anterior a ahora', () => {
    expect(debeDescartarse(minutos(-1), AHORA)).toBe(true);
    expect(debeDescartarse(AHORA, AHORA)).toBe(false);
    expect(debeDescartarse(minutos(1), AHORA)).toBe(false);
  });

  it('sin vencimiento nunca se descarta', () => {
    expect(debeDescartarse(null, AHORA)).toBe(false);
  });
});
