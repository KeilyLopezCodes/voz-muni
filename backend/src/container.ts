import knex from 'knex';
import { AuthService } from './application/services/auth.service';
import { AutorizacionService } from './application/services/autorizacion.service';
import { HealthService } from './application/services/health.service';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/auth/jwt-token-service';
import { SystemClock } from './infrastructure/clock/system-clock';
import { type Env, loadEnv } from './infrastructure/config/env';
import { buildKnexConfig } from './infrastructure/database/knex-config';
import { KnexDatabaseHealthCheck } from './infrastructure/database/knex-database-health-check';
import { KnexSesionRepository } from './infrastructure/repositories/knex-sesion-repository';
import { KnexUsuarioRepository } from './infrastructure/repositories/knex-usuario-repository';

export interface Container {
  port: number;
  loginLimitePorVentana: number;
  healthService: HealthService;
  authService: AuthService;
  autorizacionService: AutorizacionService;
  dispose(): Promise<void>;
}

// Único punto fuera de infrastructure/ que instancia sus adaptadores.
export function buildContainer(env: Env = loadEnv()): Container {
  const db = knex(buildKnexConfig(env.DATABASE_URL));
  const clock = new SystemClock();
  const usuarios = new KnexUsuarioRepository(db);
  const tokens = new JwtTokenService(env.JWT_SECRET);
  return {
    port: env.PORT,
    loginLimitePorVentana: env.LOGIN_LIMITE_POR_VENTANA,
    healthService: new HealthService(clock, new KnexDatabaseHealthCheck(db)),
    authService: new AuthService(usuarios, new KnexSesionRepository(db), new BcryptPasswordHasher(), tokens, clock),
    autorizacionService: new AutorizacionService(usuarios, tokens, clock),
    dispose: () => db.destroy(),
  };
}
