// Dobles de prueba en memoria para los servicios de autenticación (SPEC 08 y SPEC 09).
import type { EstadoBloqueo } from '../../../src/domain/auth/bloqueo';
import type { PasswordHasher } from '../../../src/domain/auth/password-hasher';
import type { Permisos } from '../../../src/domain/auth/permisos';
import type { Rol } from '../../../src/domain/auth/roles';
import type { PayloadAcceso, TokenService } from '../../../src/domain/auth/token-service';
import type { Clock } from '../../../src/domain/health/clock';
import type { NuevaSesion, Sesion, SesionRepository } from '../../../src/domain/repositories/sesion-repository';
import type {
  UsuarioActivo,
  UsuarioConCredenciales,
  UsuarioRepository,
} from '../../../src/domain/repositories/usuario-repository';

export const MINUTO = 60 * 1000;
export const DIA = 24 * 60 * MINUTO;

export interface UsuarioFalso {
  id: number;
  nombre: string;
  email: string | null;
  rol: Rol;
  dependenciaId: number | null;
  activo: boolean;
  passwordHash: string | null;
  bloqueo: EstadoBloqueo;
  permisos: Permisos;
}

export class UsuariosEnMemoria implements UsuarioRepository {
  constructor(readonly filas: UsuarioFalso[]) {}

  async buscarPorEmail(email: string): Promise<UsuarioConCredenciales | null> {
    const u = this.filas.find((fila) => fila.email?.toLowerCase() === email.toLowerCase());
    return u ? { ...u, bloqueo: { ...u.bloqueo } } : null;
  }

  async guardarBloqueo(usuarioId: number, estado: EstadoBloqueo): Promise<void> {
    this.filas.find((fila) => fila.id === usuarioId)!.bloqueo = { ...estado };
  }

  async cambiarPassword(usuarioId: number, passwordHash: string): Promise<void> {
    const u = this.filas.find((fila) => fila.id === usuarioId)!;
    u.passwordHash = passwordHash;
    u.bloqueo = { intentosFallidos: 0, bloqueadoHasta: null };
  }

  async buscarActivo(usuarioId: number): Promise<UsuarioActivo | null> {
    const u = this.filas.find((fila) => fila.id === usuarioId && fila.activo);
    return u ? { id: u.id, nombre: u.nombre, rol: u.rol, dependenciaId: u.dependenciaId, permisos: u.permisos } : null;
  }

  async emailDe(usuarioId: number): Promise<string | null> {
    return this.filas.find((fila) => fila.id === usuarioId)?.email ?? null;
  }
}

export interface SesionFalsa extends Sesion {
  tokenHash: string;
  reemplazadaPor: number | null;
}

export class SesionesEnMemoria implements SesionRepository {
  readonly filas: SesionFalsa[] = [];

  async crear(sesion: NuevaSesion): Promise<number> {
    const id = this.filas.length + 1;
    this.filas.push({ id, ...sesion, revocadaEn: null, reemplazadaPor: null });
    return id;
  }

  async buscarPorHash(tokenHash: string): Promise<Sesion | null> {
    const s = this.filas.find((fila) => fila.tokenHash === tokenHash);
    return s ? { id: s.id, usuarioId: s.usuarioId, expiraEn: s.expiraEn, revocadaEn: s.revocadaEn } : null;
  }

  async rotar(anteriorId: number, nueva: NuevaSesion, ahora: Date): Promise<number | null> {
    const anterior = this.filas.find((fila) => fila.id === anteriorId)!;
    if (anterior.revocadaEn !== null) {
      return null;
    }
    const id = await this.crear(nueva);
    anterior.revocadaEn = ahora;
    anterior.reemplazadaPor = id;
    return id;
  }

  async revocar(sesionId: number, ahora: Date): Promise<void> {
    const s = this.filas.find((fila) => fila.id === sesionId)!;
    s.revocadaEn ??= ahora;
  }

  async revocarTodasDelUsuario(usuarioId: number, ahora: Date): Promise<void> {
    for (const s of this.filas.filter((fila) => fila.usuarioId === usuarioId)) {
      s.revocadaEn ??= ahora;
    }
  }

  activasDe(usuarioId: number): SesionFalsa[] {
    return this.filas.filter((fila) => fila.usuarioId === usuarioId && fila.revocadaEn === null);
  }
}

// Hash legible: 'hash:<password>'. Registra contra qué hash se verificó cada vez.
export class HasherFalso implements PasswordHasher {
  readonly verificados: string[] = [];

  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verificar(password: string, hash: string): Promise<boolean> {
    this.verificados.push(hash);
    return hash === `hash:${password}`;
  }
}

export class TokensFalsos implements TokenService {
  private siguiente = 0;

  emitirAcceso(payload: PayloadAcceso, ahora: Date) {
    return { token: `acceso:${JSON.stringify(payload)}`, expiraEn: new Date(ahora.getTime() + 15 * MINUTO) };
  }

  verificarAcceso(token: string): PayloadAcceso | null {
    return token.startsWith('acceso:') ? (JSON.parse(token.slice('acceso:'.length)) as PayloadAcceso) : null;
  }

  generarRenovacion(): string {
    this.siguiente += 1;
    return `renovacion-${this.siguiente}`;
  }

  hashRenovacion(token: string): string {
    return `sha:${token}`;
  }
}

export class RelojFalso implements Clock {
  constructor(public actual: Date) {}

  now(): Date {
    return this.actual;
  }

  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

export const PASSWORD = 'Desarrollo2026';

export function usuario(cambios: Partial<UsuarioFalso> = {}): UsuarioFalso {
  return {
    id: 1,
    nombre: 'Ana Coordinadora',
    email: 'ana@vozmuni.test',
    rol: 'coordinador',
    dependenciaId: 4,
    activo: true,
    passwordHash: `hash:${PASSWORD}`,
    bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
    permisos: { 'tickets.ver': 'dependencia' },
    ...cambios,
  };
}
