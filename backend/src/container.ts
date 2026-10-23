import knex from 'knex';
import { AuthService } from './application/services/auth.service';
import { AutorizacionService } from './application/services/autorizacion.service';
import { HealthService } from './application/services/health.service';
import { RecuperacionService } from './application/services/recuperacion.service';
import type { EnviadorCorreo } from './domain/notificaciones/enviador-correo';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/auth/jwt-token-service';
import { SystemClock } from './infrastructure/clock/system-clock';
import { type Env, loadEnv } from './infrastructure/config/env';
import { buildKnexConfig } from './infrastructure/database/knex-config';
import { KnexDatabaseHealthCheck } from './infrastructure/database/knex-database-health-check';
import { NodemailerEnviadorCorreo } from './infrastructure/mail/nodemailer-enviador-correo';
import { KnexPlantillaRepository } from './infrastructure/repositories/knex-plantilla-repository';
import { KnexRestablecimientoRepository } from './infrastructure/repositories/knex-restablecimiento-repository';
import { KnexSesionRepository } from './infrastructure/repositories/knex-sesion-repository';
import { KnexTransaccion } from './infrastructure/repositories/knex-transaccion';
import { KnexUsuarioRepository } from './infrastructure/repositories/knex-usuario-repository';

export interface Container {
  port: number;
  loginLimitePorVentana: number;
  recuperacionLimitePorVentana: number;
  healthService: HealthService;
  authService: AuthService;
  autorizacionService: AutorizacionService;
  recuperacionService: RecuperacionService;
  dispose(): Promise<void>;
}

export interface OpcionesContainer {
  // Las pruebas inyectan un enviador que guarda los correos en memoria.
  enviadorCorreo?: EnviadorCorreo;
}

// Único punto fuera de infrastructure/ que instancia sus adaptadores.
export function buildContainer(env: Env = loadEnv(), opciones: OpcionesContainer = {}): Container {
  const db = knex(buildKnexConfig(env.DATABASE_URL));
  const clock = new SystemClock();
  const usuarios = new KnexUsuarioRepository(db);
  const sesiones = new KnexSesionRepository(db);
  const tokens = new JwtTokenService(env.JWT_SECRET);
  const hasher = new BcryptPasswordHasher();
  const enviadorCorreo =
    opciones.enviadorCorreo ??
    new NodemailerEnviadorCorreo({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.MAIL_FROM,
    });
  return {
    port: env.PORT,
    loginLimitePorVentana: env.LOGIN_LIMITE_POR_VENTANA,
    recuperacionLimitePorVentana: env.RECUPERACION_LIMITE_POR_VENTANA,
    healthService: new HealthService(clock, new KnexDatabaseHealthCheck(db)),
    authService: new AuthService(usuarios, sesiones, hasher, tokens, clock),
    autorizacionService: new AutorizacionService(usuarios, tokens, clock),
    recuperacionService: new RecuperacionService(
      usuarios,
      new KnexRestablecimientoRepository(db),
      new KnexPlantillaRepository(db),
      new KnexTransaccion(db),
      enviadorCorreo,
      hasher,
      tokens,
      clock,
      { appUrl: env.APP_URL, registrarError: (mensaje) => console.error(mensaje) },
    ),
    dispose: () => db.destroy(),
  };
}
