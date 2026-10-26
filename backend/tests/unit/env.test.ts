import { loadDatabaseEnv, loadEnv } from '../../src/infrastructure/config/env';

describe('loadEnv', () => {
  const databaseUrl = 'postgres://vozmuni:vozmuni@localhost:5432/vozmuni';
  const jwtSecret = 'x'.repeat(32);
  const minimo = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    SMTP_HOST: 'smtp.ethereal.email',
    SMTP_USER: 'usuario@ethereal.email',
    SMTP_PASS: 'clave',
    MAIL_FROM: 'VozMuni <no-responder@vozmuni.test>',
    APP_URL: 'http://localhost:5173',
    ADJUNTOS_DIR: './almacen/adjuntos',
  };
  const porDefecto = {
    PORT: 3000,
    NODE_ENV: 'development',
    LOGIN_LIMITE_POR_VENTANA: 10,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    RECUPERACION_LIMITE_POR_VENTANA: 5,
    SLA_JOB_ACTIVO: true,
    SLA_JOB_CRON: '*/5 * * * *',
    CORREOS_JOB_ACTIVO: true,
    CORREOS_JOB_CRON: '* * * * *',
    NOTIFICACIONES_PURGA_CRON: '0 3 * * *',
  };

  it('devuelve la configuración con una entrada válida', () => {
    expect(
      loadEnv({
        ...minimo,
        PORT: '4000',
        NODE_ENV: 'production',
        LOGIN_LIMITE_POR_VENTANA: '2',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        RECUPERACION_LIMITE_POR_VENTANA: '3',
        SLA_JOB_ACTIVO: 'false',
        SLA_JOB_CRON: '* * * * *',
        CORREOS_JOB_ACTIVO: 'false',
        CORREOS_JOB_CRON: '*/2 * * * *',
        NOTIFICACIONES_PURGA_CRON: '30 2 * * *',
      }),
    ).toEqual({
      ...minimo,
      PORT: 4000,
      NODE_ENV: 'production',
      LOGIN_LIMITE_POR_VENTANA: 2,
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      RECUPERACION_LIMITE_POR_VENTANA: 3,
      SLA_JOB_ACTIVO: false,
      SLA_JOB_CRON: '* * * * *',
      CORREOS_JOB_ACTIVO: false,
      CORREOS_JOB_CRON: '*/2 * * * *',
      NOTIFICACIONES_PURGA_CRON: '30 2 * * *',
    });
  });

  it('rechaza una SLA_JOB_CRON inválida (SPEC 31 y 32)', () => {
    expect(() => loadEnv({ ...minimo, SLA_JOB_CRON: 'cada 5 minutos' })).toThrow(/SLA_JOB_CRON/);
  });

  it('rechaza un SLA_JOB_ACTIVO que no es true ni false', () => {
    expect(() => loadEnv({ ...minimo, SLA_JOB_ACTIVO: 'si' })).toThrow(/SLA_JOB_ACTIVO/);
  });

  it('en NODE_ENV=test el job de SLA queda desactivado por defecto, y se puede activar', () => {
    expect(loadEnv({ ...minimo, NODE_ENV: 'test' }).SLA_JOB_ACTIVO).toBe(false);
    expect(loadEnv({ ...minimo, NODE_ENV: 'test', SLA_JOB_ACTIVO: 'true' }).SLA_JOB_ACTIVO).toBe(true);
    expect(loadEnv({ ...minimo, NODE_ENV: 'production' }).SLA_JOB_ACTIVO).toBe(true);
  });

  it('el job de correos corre cada minuto, salvo en NODE_ENV=test, y valida su expresión (SPEC 34)', () => {
    expect(loadEnv(minimo)).toMatchObject({ CORREOS_JOB_ACTIVO: true, CORREOS_JOB_CRON: '* * * * *' });
    expect(loadEnv({ ...minimo, NODE_ENV: 'test' }).CORREOS_JOB_ACTIVO).toBe(false);
    expect(loadEnv({ ...minimo, NODE_ENV: 'test', CORREOS_JOB_ACTIVO: 'true' }).CORREOS_JOB_ACTIVO).toBe(true);
    expect(() => loadEnv({ ...minimo, CORREOS_JOB_CRON: 'cada minuto' })).toThrow(/CORREOS_JOB_CRON/);
    expect(() => loadEnv({ ...minimo, CORREOS_JOB_ACTIVO: 'si' })).toThrow(/CORREOS_JOB_ACTIVO/);
  });

  it('la purga de notificaciones corre a las 03:00 por defecto y valida su expresión (SPEC 36)', () => {
    expect(loadEnv(minimo).NOTIFICACIONES_PURGA_CRON).toBe('0 3 * * *');
    expect(() => loadEnv({ ...minimo, NOTIFICACIONES_PURGA_CRON: 'de madrugada' })).toThrow(/NOTIFICACIONES_PURGA_CRON/);
  });

  describe('nombres de SPEC 31 (obsoletos)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('SLA_ALERTAS_ACTIVO y SLA_ALERTAS_CRON se aceptan con un aviso en el log', () => {
      const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const env = loadEnv({ ...minimo, SLA_ALERTAS_ACTIVO: 'false', SLA_ALERTAS_CRON: '* * * * *' });
      expect(env).toMatchObject({ SLA_JOB_ACTIVO: false, SLA_JOB_CRON: '* * * * *' });
      expect(env).not.toHaveProperty('SLA_ALERTAS_ACTIVO');
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining('SLA_JOB_ACTIVO'));
    });

    it('los nombres nuevos ganan sobre los viejos', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(loadEnv({ ...minimo, SLA_JOB_CRON: '*/2 * * * *', SLA_ALERTAS_CRON: '* * * * *' }).SLA_JOB_CRON).toBe('*/2 * * * *');
    });

    it('sin nombres viejos no avisa', () => {
      const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
      loadEnv(minimo);
      expect(aviso).not.toHaveBeenCalled();
    });
  });

  it('lanza un error que nombra DATABASE_URL cuando falta', () => {
    const { DATABASE_URL: _omitida, ...sinBase } = minimo;
    expect(() => loadEnv(sinBase)).toThrow(/DATABASE_URL/);
  });

  it('usa los valores por defecto de las variables opcionales', () => {
    expect(loadEnv(minimo)).toEqual({ ...minimo, ...porDefecto });
  });

  it('lanza un error que nombra ADJUNTOS_DIR cuando falta (SPEC 24)', () => {
    const { ADJUNTOS_DIR: _omitida, ...sinCarpeta } = minimo;
    expect(() => loadEnv(sinCarpeta)).toThrow(/ADJUNTOS_DIR/);
  });

  it('lanza un error que nombra JWT_SECRET cuando falta', () => {
    const { JWT_SECRET: _omitida, ...sinSecreto } = minimo;
    expect(() => loadEnv(sinSecreto)).toThrow(/JWT_SECRET/);
  });

  it('rechaza un JWT_SECRET de 31 caracteres', () => {
    expect(() => loadEnv({ ...minimo, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
  });

  it('rechaza un NODE_ENV fuera de la lista', () => {
    expect(() => loadEnv({ ...minimo, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rechaza un LOGIN_LIMITE_POR_VENTANA que no es mayor que 0', () => {
    expect(() => loadEnv({ ...minimo, LOGIN_LIMITE_POR_VENTANA: '0' })).toThrow(/LOGIN_LIMITE_POR_VENTANA/);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'APP_URL'] as const)(
    'lanza un error que nombra %s cuando falta',
    (variable) => {
      const { [variable]: _omitida, ...resto } = minimo;
      expect(() => loadEnv(resto)).toThrow(new RegExp(variable));
    },
  );

  it('rechaza un APP_URL con barra final', () => {
    expect(() => loadEnv({ ...minimo, APP_URL: 'http://localhost:5173/' })).toThrow(/APP_URL: no debe terminar en \//);
  });

  it('rechaza un APP_URL que no es http ni https', () => {
    expect(() => loadEnv({ ...minimo, APP_URL: 'ftp://vozmuni.test' })).toThrow(/APP_URL/);
  });

  it('rechaza un SMTP_SECURE que no es true ni false', () => {
    expect(() => loadEnv({ ...minimo, SMTP_SECURE: 'si' })).toThrow(/SMTP_SECURE/);
  });

  it('acepta MAIL_FROM como correo solo y rechaza uno sin correo', () => {
    expect(loadEnv({ ...minimo, MAIL_FROM: 'no-responder@vozmuni.test' }).MAIL_FROM).toBe('no-responder@vozmuni.test');
    expect(() => loadEnv({ ...minimo, MAIL_FROM: 'VozMuni <sin-arroba>' })).toThrow(/MAIL_FROM/);
  });

  it('rechaza un RECUPERACION_LIMITE_POR_VENTANA que no es mayor que 0', () => {
    expect(() => loadEnv({ ...minimo, RECUPERACION_LIMITE_POR_VENTANA: '0' })).toThrow(
      /RECUPERACION_LIMITE_POR_VENTANA/,
    );
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
