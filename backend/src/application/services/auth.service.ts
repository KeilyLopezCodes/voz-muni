import type { Auditoria, EventoAuditoria } from '../../domain/auditoria/auditoria';
import { estaBloqueado, registrarExito, registrarFallo } from '../../domain/auth/bloqueo';
import type { PasswordHasher } from '../../domain/auth/password-hasher';
import { DURACION_RENOVACION_MS, type TokenService } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { SesionRepository } from '../../domain/repositories/sesion-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioRepository } from '../../domain/repositories/usuario-repository';
import type { RespuestaSesion, UsuarioSesion } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { abrirSesion, respuestaSesion } from './emision-sesion';

const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';
const CUENTA_BLOQUEADA = 'Cuenta bloqueada temporalmente por intentos fallidos';
const CORREO_NO_VERIFICADO = 'El correo todavía no está verificado';
const SESION_INVALIDA = 'La sesión no existe, venció o fue revocada';

type MotivoFallo = 'password_incorrecta' | 'cuenta_bloqueada' | 'cuenta_inactiva';

// Los eventos de autenticación son globales (SPEC 42): dependencia_id NULL, solo los ven supervisor y administrador.
function eventoSesion(
  accion: 'sesion.iniciar' | 'sesion.fallar' | 'sesion.bloquear' | 'sesion.cerrar',
  usuarioId: number,
  datos?: Record<string, unknown>,
): EventoAuditoria {
  return { accion, entidadId: usuarioId, usuarioId, dependenciaId: null, datos };
}

// Login, renovación y cierre de sesión (RF-02, RNF-09). Bitácora (SPEC 42): el inicio y el cierre se registran en su
// transacción; los fallos y el bloqueo, que terminan en error, con `auditoria.registrarIndependiente`. Un correo
// inexistente y la renovación no se registran.
export class AuthService {
  private hashFicticio: Promise<string> | null = null;

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly sesiones: SesionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly transaccion: Transaccion,
    private readonly auditoria: Auditoria, // solo para registrarIndependiente
  ) {}

  async login(email: string, password: string): Promise<RespuestaSesion> {
    const ahora = this.clock.now();
    const usuario = await this.usuarios.buscarPorEmail(email);

    if (!usuario || !usuario.activo || usuario.passwordHash === null) {
      // Compara igual contra un hash del mismo costo: el tiempo no revela qué correos existen.
      await this.hasher.verificar(password, await this.obtenerHashFicticio());
      // Un correo inexistente no se registra (SPEC 42); uno inactivo o sin contraseña, sí.
      if (usuario) {
        await this.registrarFallo(usuario.id, 'cuenta_inactiva', usuario.bloqueo.intentosFallidos);
      }
      throw new ErrorDeAplicacion('CREDENCIALES_INVALIDAS', CREDENCIALES_INVALIDAS);
    }

    // Bloqueado: no se verifica la contraseña ni se suman intentos.
    if (estaBloqueado(usuario.bloqueo, ahora)) {
      await this.registrarFallo(usuario.id, 'cuenta_bloqueada', usuario.bloqueo.intentosFallidos);
      throw new ErrorDeAplicacion('CUENTA_BLOQUEADA', CUENTA_BLOQUEADA);
    }

    if (!(await this.hasher.verificar(password, usuario.passwordHash))) {
      const fallo = registrarFallo(usuario.bloqueo, ahora);
      await this.usuarios.guardarBloqueo(usuario.id, fallo.estado);
      // Después de guardar el contador y antes de lanzar: el registro sobrevive al error.
      await this.registrarFallo(usuario.id, 'password_incorrecta', usuario.bloqueo.intentosFallidos + 1);
      if (fallo.bloqueado) {
        await this.auditoria.registrarIndependiente(
          eventoSesion('sesion.bloquear', usuario.id, { bloqueadoHasta: fallo.estado.bloqueadoHasta }),
        );
        throw new ErrorDeAplicacion('CUENTA_BLOQUEADA', CUENTA_BLOQUEADA);
      }
      throw new ErrorDeAplicacion('CREDENCIALES_INVALIDAS', CREDENCIALES_INVALIDAS);
    }

    const datos: UsuarioSesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      dependenciaId: usuario.dependenciaId,
    };
    // El reinicio de intentos, la sesión y su registro comparten la transacción (SPEC 42).
    const respuesta = await this.transaccion.ejecutar(async (repos) => {
      if (usuario.bloqueo.intentosFallidos !== 0 || usuario.bloqueo.bloqueadoHasta !== null) {
        await repos.usuarios.guardarBloqueo(usuario.id, registrarExito());
      }
      // SPEC 16: solo con la contraseña correcta, así quien no la conoce no sabe si la cuenta está verificada.
      // El reinicio de intentos se confirma igual; sin sesión no hay sesion.iniciar.
      if (!usuario.correoVerificado) {
        return null;
      }
      const sesion = await abrirSesion(this.tokens, repos.sesiones, datos, ahora);
      await repos.auditoria.registrar(eventoSesion('sesion.iniciar', usuario.id));
      return sesion;
    });
    if (respuesta === null) {
      throw new ErrorDeAplicacion('CORREO_NO_VERIFICADO', CORREO_NO_VERIFICADO);
    }
    return respuesta;
  }

  async renovar(refreshToken: string): Promise<RespuestaSesion> {
    const ahora = this.clock.now();
    const sesion = await this.sesiones.buscarPorHash(this.tokens.hashRenovacion(refreshToken));

    if (!sesion || sesion.expiraEn.getTime() <= ahora.getTime()) {
      throw new ErrorDeAplicacion('SESION_INVALIDA', SESION_INVALIDA);
    }

    const usuario = await this.usuarios.buscarActivo(sesion.usuarioId);
    if (!usuario) {
      await this.sesiones.revocar(sesion.id, ahora);
      throw new ErrorDeAplicacion('SESION_INVALIDA', SESION_INVALIDA);
    }

    // Reuso de un token ya rotado: puede estar robado, así que se cierran todas las sesiones.
    if (sesion.revocadaEn !== null) {
      await this.sesiones.revocarTodasDelUsuario(sesion.usuarioId, ahora);
      throw new ErrorDeAplicacion('SESION_INVALIDA', SESION_INVALIDA);
    }

    const nuevoToken = this.tokens.generarRenovacion();
    const nuevaExpiraEn = new Date(ahora.getTime() + DURACION_RENOVACION_MS);
    const nuevaId = await this.sesiones.rotar(
      sesion.id,
      { usuarioId: sesion.usuarioId, tokenHash: this.tokens.hashRenovacion(nuevoToken), expiraEn: nuevaExpiraEn },
      ahora,
    );
    // Otra petición la rotó primero: también es reuso.
    if (nuevaId === null) {
      await this.sesiones.revocarTodasDelUsuario(sesion.usuarioId, ahora);
      throw new ErrorDeAplicacion('SESION_INVALIDA', SESION_INVALIDA);
    }

    const datos: UsuarioSesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      dependenciaId: usuario.dependenciaId,
    };
    return respuestaSesion(this.tokens, datos, nuevoToken, nuevaExpiraEn, ahora);
  }

  // Idempotente: no revela si el token existía. Solo un token válido deja sesion.cerrar (SPEC 42).
  async cerrarSesion(refreshToken: string): Promise<void> {
    const ahora = this.clock.now();
    const sesion = await this.sesiones.buscarPorHash(this.tokens.hashRenovacion(refreshToken));
    if (sesion && sesion.revocadaEn === null && sesion.expiraEn.getTime() > ahora.getTime()) {
      await this.transaccion.ejecutar(async (repos) => {
        await repos.sesiones.revocar(sesion.id, ahora);
        await repos.auditoria.registrar(eventoSesion('sesion.cerrar', sesion.usuarioId));
      });
    }
  }

  private registrarFallo(usuarioId: number, motivo: MotivoFallo, intentos: number): Promise<void> {
    return this.auditoria.registrarIndependiente(eventoSesion('sesion.fallar', usuarioId, { motivo, intentos }));
  }

  // Se calcula una vez con el mismo hasher, para que tenga el mismo costo que los hashes reales.
  private obtenerHashFicticio(): Promise<string> {
    this.hashFicticio ??= this.hasher.hash('contraseña-ficticia-para-igualar-tiempos');
    return this.hashFicticio;
  }
}
