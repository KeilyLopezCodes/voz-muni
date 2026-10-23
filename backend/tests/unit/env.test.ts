import { loadDatabaseEnv, loadEnv } from '../../src/infrastructure/config/env';

describe('loadEnv', () => {
  const databaseUrl = 'postgres://vozmuni:vozmuni@localhost:5432/vozmuni';
  const jwtSecret = 'x'.repeat(32);
  const minimo = { DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret };

  it('devuelve la configuración con una entrada válida', () => {
    expect(
      loadEnv({ ...minimo, PORT: '4000', NODE_ENV: 'production', LOGIN_LIMITE_POR_VENTANA: '2' }),
    ).toEqual({
      PORT: 4000,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: jwtSecret,
      NODE_ENV: 'production',
      LOGIN_LIMITE_POR_VENTANA: 2,
    });
  });

  it('lanza un error que nombra DATABASE_URL cuando falta', () => {
    expect(() => loadEnv({ PORT: '4000', JWT_SECRET: jwtSecret })).toThrow(/DATABASE_URL/);
  });

  it('usa los valores por defecto de PORT, NODE_ENV y LOGIN_LIMITE_POR_VENTANA', () => {
    expect(loadEnv(minimo)).toEqual({
      PORT: 3000,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: jwtSecret,
      NODE_ENV: 'development',
      LOGIN_LIMITE_POR_VENTANA: 10,
    });
  });

  it('lanza un error que nombra JWT_SECRET cuando falta', () => {
    expect(() => loadEnv({ DATABASE_URL: databaseUrl })).toThrow(/JWT_SECRET/);
  });

  it('rechaza un JWT_SECRET de 31 caracteres', () => {
    expect(() => loadEnv({ DATABASE_URL: databaseUrl, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
  });

  it('rechaza un NODE_ENV fuera de la lista', () => {
    expect(() => loadEnv({ ...minimo, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rechaza un LOGIN_LIMITE_POR_VENTANA que no es mayor que 0', () => {
    expect(() => loadEnv({ ...minimo, LOGIN_LIMITE_POR_VENTANA: '0' })).toThrow(/LOGIN_LIMITE_POR_VENTANA/);
  });
});

describe('loadDatabaseEnv', () => {
  it('solo exige DATABASE_URL, para que la CLI de Knex no necesite JWT_SECRET', () => {
    const databaseUrl = 'postgres://vozmuni:vozmuni@localhost:5432/vozmuni';
    expect(loadDatabaseEnv({ DATABASE_URL: databaseUrl })).toEqual({ DATABASE_URL: databaseUrl });
  });

  it('lanza un error que nombra DATABASE_URL cuando falta', () => {
    expect(() => loadDatabaseEnv({})).toThrow(/DATABASE_URL/);
  });
});
