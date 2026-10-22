import { loadEnv } from '../../src/infrastructure/config/env';

describe('loadEnv', () => {
  const databaseUrl = 'postgres://vozmuni:vozmuni@localhost:5432/vozmuni';

  it('devuelve la configuración con una entrada válida', () => {
    expect(loadEnv({ PORT: '4000', DATABASE_URL: databaseUrl })).toEqual({
      PORT: 4000,
      DATABASE_URL: databaseUrl,
    });
  });

  it('lanza un error que nombra DATABASE_URL cuando falta', () => {
    expect(() => loadEnv({ PORT: '4000' })).toThrow(/DATABASE_URL/);
  });

  it('usa el puerto 3000 cuando PORT no está definido', () => {
    expect(loadEnv({ DATABASE_URL: databaseUrl }).PORT).toBe(3000);
  });
});
