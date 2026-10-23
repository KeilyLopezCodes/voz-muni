// Dobles de prueba en memoria para los servicios de autenticación (SPEC 08 y SPEC 09).
import type { EstadoBloqueo } from '../../../src/domain/auth/bloqueo';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { EnviadorCorreo, MensajeCorreo } from '../../../src/domain/notificaciones/enviador-correo';
import type { Plantilla } from '../../../src/domain/notificaciones/plantilla';
import type { PlantillaRepository } from '../../../src/domain/repositories/plantilla-repository';
import type {
  RestablecimientoRepository,
  RestablecimientoVigente,
} from '../../../src/domain/repositories/restablecimiento-repository';
import type {
  NuevoRegistro,
  RegistroVecinoRepository,
  UsuariosParaRegistro,
} from '../../../src/domain/repositories/registro-vecino-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import type { UsuarioParaRegistro } from '../../../src/domain/usuarios/registro-vecino';
import type {
  CambiosUsuarioInterno,
  FiltroUsuarios,
  NuevoUsuarioInterno,
  UsuarioAdminRepository,
  UsuarioInterno,
} from '../../../src/domain/repositories/usuario-admin-repository';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../../src/domain/repositories/vecino-repository';
import type { RolInterno } from '../../../src/domain/usuarios/usuario-interno';
import type { DatosVecinoNuevo } from '../../../src/domain/usuarios/vecino';
import type { PasswordHasher } from '../../../src/domain/auth/password-hasher';
import type { Permisos } from '../../../src/domain/auth/permisos';
import type { Rol } from '../../../src/domain/auth/roles';
import {
  type PayloadAcceso,
  type TipoRestablecimiento,
  type TokenService,
  VIGENCIA_RESTABLECIMIENTO_MS,
} from '../../../src/domain/auth/token-service';
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
  telefono: string | null;
  dpi: string | null;
  rol: Rol;
  dependenciaId: number | null;
  activo: boolean;
  passwordHash: string | null;
  bloqueo: EstadoBloqueo;
  permisos: Permisos;
  correoVerificadoEn: Date | null; // SPEC 16
}

export class UsuariosEnMemoria implements UsuarioRepository {
  constructor(readonly filas: UsuarioFalso[]) {}

  async buscarPorEmail(email: string): Promise<UsuarioConCredenciales | null> {
    const u = this.filas.find((fila) => fila.email?.toLowerCase() === email.toLowerCase());
    return u ? { ...u, bloqueo: { ...u.bloqueo }, correoVerificado: u.correoVerificadoEn !== null } : null;
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
    telefono: null,
    dpi: null,
    rol: 'coordinador',
    dependenciaId: 4,
    activo: true,
    passwordHash: `hash:${PASSWORD}`,
    bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
    permisos: { 'tickets.ver': 'dependencia' },
    correoVerificadoEn: new Date('2026-01-01T00:00:00Z'),
    ...cambios,
  };
}

// Permisos por rol para los usuarios que crea el doble de UsuarioAdminRepository.
const PERMISOS_POR_ROL: Record<string, Permisos> = {
  administrador: { 'admin.usuarios': 'si' },
  tecnico: { 'tickets.ver': 'asignadas' },
};

// Vecinos sobre las mismas filas de UsuariosEnMemoria; crear detecta correo y DPI duplicados de cualquier usuario.
export class VecinosEnMemoria implements VecinoRepository {
  constructor(private readonly usuarios: UsuariosEnMemoria) {}

  private aVecino(u: UsuarioFalso): Vecino {
    return { id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono };
  }

  private activos(): UsuarioFalso[] {
    return this.usuarios.filas.filter((u) => u.rol === 'vecino' && u.activo);
  }

  async obtenerActivo(id: number): Promise<Vecino | null> {
    const u = this.activos().find((fila) => fila.id === id);
    return u ? this.aVecino(u) : null;
  }

  async buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]> {
    const cumple = (u: UsuarioFalso) =>
      'email' in criterio
        ? u.email?.toLowerCase() === criterio.email.toLowerCase()
        : 'telefono' in criterio
          ? u.telefono === criterio.telefono
          : u.dpi === criterio.dpi;
    return this.activos().filter(cumple).slice(0, limite).map((u) => this.aVecino(u));
  }

  async crear(datos: DatosVecinoNuevo): Promise<{ id: number }> {
    if (datos.email && this.usuarios.filas.some((u) => u.email?.toLowerCase() === datos.email!.toLowerCase())) {
      throw new ReglaDeNegocioError('EMAIL_DUPLICADO', 'correo repetido');
    }
    if (this.usuarios.filas.some((u) => u.dpi === datos.dpi)) {
      throw new ReglaDeNegocioError('DPI_DUPLICADO', 'DPI repetido');
    }
    const id = Math.max(0, ...this.usuarios.filas.map((u) => u.id)) + 1;
    this.usuarios.filas.push({
      ...datos,
      id,
      rol: 'vecino',
      dependenciaId: null,
      activo: true,
      passwordHash: null,
      bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
      permisos: { 'tickets.crear': 'propia', 'tickets.ver': 'propia' },
      correoVerificadoEn: null,
    });
    return { id };
  }
}

// Registro del portal (SPEC 16) sobre las mismas filas de UsuariosEnMemoria.
export class RegistroVecinosEnMemoria implements RegistroVecinoRepository {
  // Si se fija, crearPendiente lanza este duplicado, como si otro registro hubiera ganado la carrera.
  duplicadoEnCarrera: 'EMAIL_DUPLICADO' | 'DPI_DUPLICADO' | null = null;

  constructor(private readonly usuarios: UsuariosEnMemoria) {}

  private aRegistro(u: UsuarioFalso | undefined): UsuarioParaRegistro | null {
    return u
      ? {
          id: u.id,
          rol: u.rol,
          activo: u.activo,
          tienePassword: u.passwordHash !== null,
          verificado: u.correoVerificadoEn !== null,
        }
      : null;
  }

  async buscarParaRegistro(email: string, dpi: string): Promise<UsuariosParaRegistro> {
    return {
      porCorreo: this.aRegistro(this.usuarios.filas.find((u) => u.email?.toLowerCase() === email.toLowerCase())),
      porDpi: this.aRegistro(this.usuarios.filas.find((u) => u.dpi === dpi)),
    };
  }

  async crearPendiente(datos: NuevoRegistro): Promise<{ id: number }> {
    if (this.duplicadoEnCarrera) {
      throw new ReglaDeNegocioError(this.duplicadoEnCarrera, 'duplicado en carrera');
    }
    const id = Math.max(0, ...this.usuarios.filas.map((u) => u.id)) + 1;
    this.usuarios.filas.push({
      id,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      dpi: datos.dpi,
      rol: 'vecino',
      dependenciaId: null,
      activo: true,
      passwordHash: datos.passwordHash,
      bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
      permisos: { 'tickets.crear': 'propia', 'tickets.ver': 'propia' },
      correoVerificadoEn: null,
    });
    return { id };
  }

  async reemplazarPendiente(usuarioId: number, datos: NuevoRegistro): Promise<void> {
    const u = this.usuarios.filas.find((fila) => fila.id === usuarioId && fila.correoVerificadoEn === null)!;
    u.nombre = datos.nombre;
    u.dpi = datos.dpi;
    u.telefono = datos.telefono;
    u.passwordHash = datos.passwordHash;
  }

  async marcarVerificado(usuarioId: number, ahora: Date): Promise<void> {
    const u = this.usuarios.filas.find((fila) => fila.id === usuarioId)!;
    u.correoVerificadoEn ??= ahora;
  }
}

// Comparte las filas con UsuariosEnMemoria, como en la base comparten la tabla usuarios.
export class UsuariosAdminEnMemoria implements UsuarioAdminRepository {
  readonly dependenciasActivas = new Set<number>([4]);
  bloqueosDeConteo = 0;

  constructor(private readonly usuarios: UsuariosEnMemoria) {}

  private aInterno(u: UsuarioFalso): UsuarioInterno {
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email!,
      telefono: u.telefono,
      dpi: u.dpi,
      rol: u.rol as RolInterno,
      dependenciaId: u.dependenciaId,
      activo: u.activo,
      tienePassword: u.passwordHash !== null,
      bloqueadoHasta: u.bloqueo.bloqueadoHasta,
    };
  }

  async listar(filtro: FiltroUsuarios): Promise<{ datos: UsuarioInterno[]; total: number }> {
    const todos = this.usuarios.filas.filter((u) => u.rol !== 'vecino').map((u) => this.aInterno(u));
    return { datos: todos.slice((filtro.pagina - 1) * filtro.tamano, filtro.pagina * filtro.tamano), total: todos.length };
  }

  async obtenerInterno(id: number): Promise<UsuarioInterno | null> {
    const u = this.usuarios.filas.find((fila) => fila.id === id && fila.rol !== 'vecino');
    return u ? this.aInterno(u) : null;
  }

  async crear(nuevo: NuevoUsuarioInterno): Promise<UsuarioInterno> {
    if (this.usuarios.filas.some((u) => u.email?.toLowerCase() === nuevo.email.toLowerCase())) {
      throw new ReglaDeNegocioError('EMAIL_DUPLICADO', 'correo repetido');
    }
    if (this.usuarios.filas.some((u) => u.dpi === nuevo.dpi)) {
      throw new ReglaDeNegocioError('DPI_DUPLICADO', 'DPI repetido');
    }
    const fila: UsuarioFalso = {
      ...nuevo,
      id: Math.max(0, ...this.usuarios.filas.map((u) => u.id)) + 1,
      activo: true,
      passwordHash: null,
      bloqueo: { intentosFallidos: 0, bloqueadoHasta: null },
      permisos: PERMISOS_POR_ROL[nuevo.rol] ?? {},
      correoVerificadoEn: null,
    };
    this.usuarios.filas.push(fila);
    return this.aInterno(fila);
  }

  async actualizar(id: number, cambios: CambiosUsuarioInterno): Promise<UsuarioInterno> {
    const u = this.usuarios.filas.find((fila) => fila.id === id)!;
    if (cambios.nombre !== undefined) u.nombre = cambios.nombre;
    if (cambios.telefono !== undefined) u.telefono = cambios.telefono;
    if (cambios.rol !== undefined) u.rol = cambios.rol;
    if (cambios.dependenciaId !== undefined) u.dependenciaId = cambios.dependenciaId;
    if (cambios.activo !== undefined) u.activo = cambios.activo;
    if (cambios.desbloquear) u.bloqueo = { intentosFallidos: 0, bloqueadoHasta: null };
    return this.aInterno(u);
  }

  async contarAdminsActivosParaActualizar(): Promise<number> {
    this.bloqueosDeConteo += 1;
    return this.usuarios.filas.filter((u) => u.rol === 'administrador' && u.activo).length;
  }

  async dependenciaActiva(dependenciaId: number): Promise<boolean> {
    return this.dependenciasActivas.has(dependenciaId);
  }
}

export interface RestablecimientoFalso {
  id: number;
  usuarioId: number;
  tokenHash: string;
  tipo: TipoRestablecimiento;
  expiraEn: Date;
  usadoEn: Date | null;
  invalidadoEn: Date | null;
}

export class RestablecimientosEnMemoria implements RestablecimientoRepository {
  readonly filas: RestablecimientoFalso[] = [];

  async invalidarPendientes(usuarioId: number, ahora: Date): Promise<void> {
    for (const r of this.filas.filter((f) => f.usuarioId === usuarioId && !f.usadoEn && !f.invalidadoEn)) {
      r.invalidadoEn = ahora;
    }
  }

  async crear(usuarioId: number, tokenHash: string, tipo: TipoRestablecimiento, ahora: Date): Promise<void> {
    this.filas.push({
      id: this.filas.length + 1,
      usuarioId,
      tokenHash,
      tipo,
      expiraEn: new Date(ahora.getTime() + VIGENCIA_RESTABLECIMIENTO_MS[tipo]),
      usadoEn: null,
      invalidadoEn: null,
    });
  }

  async buscarVigente(
    tokenHash: string,
    ahora: Date,
    tipos: readonly TipoRestablecimiento[],
  ): Promise<RestablecimientoVigente | null> {
    const r = this.filas.find(
      (f) =>
        f.tokenHash === tokenHash &&
        tipos.includes(f.tipo) &&
        !f.usadoEn &&
        !f.invalidadoEn &&
        f.expiraEn.getTime() > ahora.getTime(),
    );
    return r ? { id: r.id, usuarioId: r.usuarioId, tipo: r.tipo } : null;
  }

  async marcarUsado(id: number, ahora: Date): Promise<void> {
    this.filas.find((f) => f.id === id)!.usadoEn = ahora;
  }
}

// Las plantillas reales viven en la base; aquí basta con usar las variables.
export class PlantillasEnMemoria implements PlantillaRepository {
  readonly plantillas = new Map<string, Plantilla>(
    [
      ['recuperacion_password', 'Recupera', '{{nombre}}: {{enlace}}', '<a href="{{enlace}}">{{nombre}}</a>'],
      ['password_cambiado', 'Cambiada', '{{nombre}}', '<p>{{nombre}}</p>'],
      ['invitacion_usuario', 'Invitación', '{{nombre}} ({{rol}}): {{enlace}}', '<a href="{{enlace}}">{{nombre}}</a>'],
      ['cuenta_desactivada', 'Desactivada', '{{nombre}}', '<p>{{nombre}}</p>'],
      ['invitacion_vecino', 'Portal', '{{nombre}}: {{enlace}}', '<a href="{{enlace}}">{{nombre}}</a>'],
      ['verificacion_correo', 'Confirma', '{{nombre}}: {{enlace}}', '<a href="{{enlace}}">{{nombre}}</a>'],
      ['cuenta_existente', 'Ya tienes cuenta', 'Ya existe una cuenta', '<p>Ya existe una cuenta</p>'],
      ['registro_no_completado', 'No se pudo', 'No pudimos crear tu cuenta', '<p>No pudimos crear tu cuenta</p>'],
    ].map(([clave, asunto, cuerpoTexto, cuerpoHtml]) => [clave, { clave, asunto, cuerpoTexto, cuerpoHtml }]),
  );

  async buscarPorClave(clave: string): Promise<Plantilla | null> {
    return this.plantillas.get(clave) ?? null;
  }
}

export class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallar = false;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallar) {
      throw new Error('ECONNREFUSED smtp');
    }
    this.enviados.push(mensaje);
  }
}

// Sin rollback real: los dobles en memoria no lo necesitan para estas pruebas.
// Cada prueba pasa solo los repositorios que su servicio usa.
export class TransaccionEnMemoria implements Transaccion {
  constructor(private readonly repos: Partial<ReposTransaccionales>) {}

  ejecutar<T>(trabajo: (repos: ReposTransaccionales) => Promise<T>): Promise<T> {
    return trabajo(this.repos as ReposTransaccionales);
  }
}

// Los correos que salen sin esperar: deja correr las promesas pendientes.
export const correosPendientes = () => new Promise((resolver) => setImmediate(resolver));
