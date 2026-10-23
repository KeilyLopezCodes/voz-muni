import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLES, type Rol } from '../../domain/auth/roles';
import {
  DURACION_ACCESO_MS,
  type PayloadAcceso,
  type TokenEmitido,
  type TokenService,
} from '../../domain/auth/token-service';

const ALGORITMO = 'HS256';

function segundos(fecha: Date): number {
  return Math.floor(fecha.getTime() / 1000);
}

function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

// Token de acceso JWT HS256 y token de renovación opaco de 32 bytes aleatorios.
export class JwtTokenService implements TokenService {
  constructor(private readonly secreto: string) {}

  emitirAcceso({ sub, rol, dep }: PayloadAcceso, ahora: Date): TokenEmitido {
    const iat = segundos(ahora);
    const exp = iat + DURACION_ACCESO_MS / 1000;
    const token = jwt.sign({ sub, rol, dep, iat, exp }, this.secreto, { algorithm: ALGORITMO });
    return { token, expiraEn: new Date(exp * 1000) };
  }

  verificarAcceso(token: string, ahora: Date): PayloadAcceso | null {
    try {
      const payload = jwt.verify(token, this.secreto, { algorithms: [ALGORITMO], clockTimestamp: segundos(ahora) });
      if (typeof payload === 'string' || typeof payload.sub !== 'string' || !esRol(payload.rol)) {
        return null;
      }
      const dep: unknown = payload.dep;
      if (dep !== null && typeof dep !== 'number') {
        return null;
      }
      return { sub: payload.sub, rol: payload.rol, dep };
    } catch {
      return null;
    }
  }

  generarRenovacion(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRenovacion(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
