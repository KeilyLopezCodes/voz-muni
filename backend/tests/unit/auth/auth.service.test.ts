import { AuthService } from '../../../src/application/services/auth.service';
import { AutorizacionService } from '../../../src/application/services/autorizacion.service';
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

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

interface UsuarioFalso {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  dependenciaId: number | null;
  activo: boolean;
  passwordHash: string | null;
  bloqueo: EstadoBloqueo;
  permisos: Permisos;
}

class UsuariosEnMemoria implements UsuarioRepository {
  constructor(readonly filas: UsuarioFalso[]) {}

  async buscarPorEmail(email: string): Promise<UsuarioConCredenciales | null> {
    const u = this.filas.find((fila) => fila.email.toLowerCase() === email.toLowerCase());
    return u ? { ...u, bloqueo: { ...u.bloqueo } } : null;
  }

  async guardarBloqueo(usuarioId: number, estado: EstadoBloqueo): Promise<void> {
    this.filas.find((fila) => fila.id === usuarioId)!.bloqueo = { ...estado };
  }

  async buscarActivo(usuarioId: number): Promise<UsuarioActivo | null> {
    const u = this.filas.find((fila) => fila.id === usuarioId && fila.activo);
    return u ? { id: u.id, nombre: u.nombre, rol: u.rol, dependenciaId: u.dependenciaId, permisos: u.permisos } : null;
  }
}

interface SesionFalsa extends Sesion {
  tokenHash: string;
  reemplazadaPor: number | null;
}

class SesionesEnMemoria implements SesionRepository {
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
class HasherFalso implements PasswordHasher {
  readonly verificados: string[] = [];

  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verificar(password: string, hash: string): Promise<boolean> {
    this.verificados.push(hash);
    return hash === `hash:${password}`;
  }
}

class TokensFalsos implements TokenService {
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

class RelojFalso implements Clock {
  constructor(public actual: Date) {}

  now(): Date {
    return this.actual;
  }

  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

const PASSWORD = 'Desarrollo2026';

function usuario(cambios: Partial<UsuarioFalso> = {}): UsuarioFalso {
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

function crearEscenario(filas: UsuarioFalso[] = [usuario()]) {
  const usuarios = new UsuariosEnMemoria(filas);
  const sesiones = new SesionesEnMemoria();
  const hasher = new HasherFalso();
  const tokens = new TokensFalsos();
  const reloj = new RelojFalso(new Date('2026-10-22T15:00:00.000Z'));
  return {
    usuarios,
    sesiones,
    hasher,
    reloj,
    auth: new AuthService(usuarios, sesiones, hasher, tokens, reloj),
    autorizacion: new AutorizacionService(usuarios, tokens, reloj),
  };
}

describe('AuthService.login', () => {
  it('con credenciales correctas devuelve los dos tokens, sus vencimientos y el usuario', async () => {
    const { auth, sesiones } = crearEscenario();

    const respuesta = await auth.login('ana@vozmuni.test', PASSWORD);

    expect(respuesta).toEqual({
      accessToken: expect.stringMatching(/^acceso:/),
      accessExpiraEn: '2026-10-22T15:15:00.000Z',
      refreshToken: 'renovacion-1',
      refreshExpiraEn: '2026-10-29T15:00:00.000Z',
      usuario: { id: 1, nombre: 'Ana Coordinadora', rol: 'coordinador', dependenciaId: 4 },
    });
    expect(sesiones.filas).toEqual([
      expect.objectContaining({ usuarioId: 1, tokenHash: 'sha:renovacion-1', revocadaEn: null }),
    ]);
  });

  it('un login correcto limpia los intentos fallidos', async () => {
    const { auth, usuarios } = crearEscenario([usuario({ bloqueo: { intentosFallidos: 3, bloqueadoHasta: null } })]);

    await auth.login('ana@vozmuni.test', PASSWORD);

    expect(usuarios.filas[0].bloqueo).toEqual({ intentosFallidos: 0, bloqueadoHasta: null });
  });

  it('una contraseña incorrecta responde CREDENCIALES_INVALIDAS y suma un intento', async () => {
    const { auth, usuarios } = crearEscenario();

    await expect(auth.login('ana@vozmuni.test', 'otra')).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(usuarios.filas[0].bloqueo.intentosFallidos).toBe(1);
  });

  it('un correo inexistente responde lo mismo y compara contra el hash ficticio', async () => {
    const { auth, hasher } = crearEscenario();

    const error = await auth.login('nadie@vozmuni.test', PASSWORD).catch((e: unknown) => e);
    const errorCorrecto = await auth.login('ana@vozmuni.test', 'otra').catch((e: unknown) => e);

    expect(error).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect((error as Error).message).toBe((errorCorrecto as Error).message);
    expect(hasher.verificados[0]).toMatch(/^hash:/);
    expect(hasher.verificados[0]).not.toBe(`hash:${PASSWORD}`);
  });

  it.each([
    ['inactivo', { activo: false }],
    ['sin password_hash', { passwordHash: null }],
  ])('un usuario %s responde CREDENCIALES_INVALIDAS sin sumar intentos', async (_caso, cambios) => {
    const { auth, usuarios, hasher } = crearEscenario([usuario(cambios)]);

    await expect(auth.login('ana@vozmuni.test', PASSWORD)).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(usuarios.filas[0].bloqueo).toEqual({ intentosFallidos: 0, bloqueadoHasta: null });
    expect(hasher.verificados).toHaveLength(1);
  });

  it('el 5.º fallo bloquea y responde CUENTA_BLOQUEADA durante 15 minutos', async () => {
    const { auth, usuarios, hasher, reloj } = crearEscenario();

    for (let i = 0; i < 4; i++) {
      await expect(auth.login('ana@vozmuni.test', 'otra')).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    }
    await expect(auth.login('ana@vozmuni.test', 'otra')).rejects.toMatchObject({ codigo: 'CUENTA_BLOQUEADA' });
    expect(usuarios.filas[0].bloqueo).toEqual({
      intentosFallidos: 0,
      bloqueadoHasta: new Date('2026-10-22T15:15:00.000Z'),
    });

    // Bloqueada: ni la contraseña correcta entra, y no se verifica ni suma intentos.
    const verificadosAntes = hasher.verificados.length;
    reloj.avanzar(15 * MINUTO - 1);
    await expect(auth.login('ana@vozmuni.test', PASSWORD)).rejects.toMatchObject({ codigo: 'CUENTA_BLOQUEADA' });
    expect(hasher.verificados).toHaveLength(verificadosAntes);
    expect(usuarios.filas[0].bloqueo.intentosFallidos).toBe(0);

    // Vencido el bloqueo, la contraseña correcta entra y limpia el estado.
    reloj.avanzar(1);
    await expect(auth.login('ana@vozmuni.test', PASSWORD)).resolves.toMatchObject({ usuario: { id: 1 } });
    expect(usuarios.filas[0].bloqueo).toEqual({ intentosFallidos: 0, bloqueadoHasta: null });
  });
});

describe('AuthService.renovar', () => {
  it('rota el token: devuelve uno nuevo, revoca el anterior y lo enlaza', async () => {
    const { auth, sesiones, reloj } = crearEscenario();
    const { refreshToken } = await auth.login('ana@vozmuni.test', PASSWORD);
    reloj.avanzar(DIA);

    const respuesta = await auth.renovar(refreshToken);

    expect(respuesta.refreshToken).toBe('renovacion-2');
    expect(respuesta.refreshExpiraEn).toBe('2026-10-30T15:00:00.000Z');
    expect(respuesta.usuario).toEqual({ id: 1, nombre: 'Ana Coordinadora', rol: 'coordinador', dependenciaId: 4 });
    expect(sesiones.filas[0]).toMatchObject({ revocadaEn: reloj.actual, reemplazadaPor: 2 });
    expect(sesiones.activasDe(1).map((s) => s.tokenHash)).toEqual(['sha:renovacion-2']);
  });

  it('reusar un token ya rotado responde SESION_INVALIDA y revoca todas las sesiones del usuario', async () => {
    const { auth, sesiones } = crearEscenario();
    const primera = await auth.login('ana@vozmuni.test', PASSWORD);
    await auth.login('ana@vozmuni.test', PASSWORD); // otra sesión, en otro dispositivo
    await auth.renovar(primera.refreshToken);
    expect(sesiones.activasDe(1)).toHaveLength(2);

    await expect(auth.renovar(primera.refreshToken)).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
    expect(sesiones.activasDe(1)).toHaveLength(0);
  });

  it('un token vencido responde SESION_INVALIDA', async () => {
    const { auth, reloj } = crearEscenario();
    const { refreshToken } = await auth.login('ana@vozmuni.test', PASSWORD);
    reloj.avanzar(7 * DIA);

    await expect(auth.renovar(refreshToken)).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
  });

  it('un token inexistente responde SESION_INVALIDA', async () => {
    const { auth } = crearEscenario();

    await expect(auth.renovar('no-existe')).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
  });

  it('si el usuario se desactivó, revoca la sesión y responde SESION_INVALIDA', async () => {
    const { auth, usuarios, sesiones } = crearEscenario();
    const { refreshToken } = await auth.login('ana@vozmuni.test', PASSWORD);
    usuarios.filas[0].activo = false;

    await expect(auth.renovar(refreshToken)).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
    expect(sesiones.activasDe(1)).toHaveLength(0);
  });
});

describe('AuthService.cerrarSesion', () => {
  it('revoca la sesión y es idempotente, también con un token inexistente', async () => {
    const { auth, sesiones } = crearEscenario();
    const { refreshToken } = await auth.login('ana@vozmuni.test', PASSWORD);

    await expect(auth.cerrarSesion(refreshToken)).resolves.toBeUndefined();
    const revocadaEn = sesiones.filas[0].revocadaEn;
    await expect(auth.cerrarSesion(refreshToken)).resolves.toBeUndefined();
    await expect(auth.cerrarSesion('no-existe')).resolves.toBeUndefined();

    expect(revocadaEn).not.toBeNull();
    expect(sesiones.filas[0].revocadaEn).toBe(revocadaEn);
    await expect(auth.renovar(refreshToken)).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
  });
});

describe('AutorizacionService.usuarioAutenticado', () => {
  it('devuelve el usuario con los permisos actuales de su rol', async () => {
    const { auth, autorizacion } = crearEscenario();
    const { accessToken } = await auth.login('ana@vozmuni.test', PASSWORD);

    await expect(autorizacion.usuarioAutenticado(accessToken)).resolves.toEqual({
      id: 1,
      nombre: 'Ana Coordinadora',
      rol: 'coordinador',
      dependenciaId: 4,
      permisos: { 'tickets.ver': 'dependencia' },
    });
  });

  it('un token inválido responde TOKEN_INVALIDO', async () => {
    const { autorizacion } = crearEscenario();

    await expect(autorizacion.usuarioAutenticado('basura')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('un usuario desactivado después de emitir el token responde TOKEN_INVALIDO', async () => {
    const { auth, autorizacion, usuarios } = crearEscenario();
    const { accessToken } = await auth.login('ana@vozmuni.test', PASSWORD);
    usuarios.filas[0].activo = false;

    await expect(autorizacion.usuarioAutenticado(accessToken)).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });
});
