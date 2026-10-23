import { estaBloqueado, registrarExito, registrarFallo } from '../../domain/auth/bloqueo';
import type { PasswordHasher } from '../../domain/auth/password-hasher';
import { DURACION_RENOVACION_MS, type TokenService } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { SesionRepository } from '../../domain/repositories/sesion-repository';
import type { UsuarioRepository } from '../../domain/repositories/usuario-repository';
import type { RespuestaSesion, UsuarioSesion } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { abrirSesion, respuestaSesion } from './emision-sesion';

const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';
const CUENTA_BLOQUEADA = 'Cuenta bloqueada temporalmente por intentos fallidos';
const CORREO_NO_VERIFICADO = 'El correo todavía no está verificado';
const SESION_INVALIDA = 'La sesión no existe, venció o fue revocada';

// Login, renovación y cierre de sesión (RF-02, RNF-09).
export class AuthService {
  private hashFicticio: Promise<string> | null = null;

  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly sesiones: SesionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async login(email: string, password: string): Promise<RespuestaSesion> {
    const ahora = this.clock.now();
    const usuario = await this.usuarios.buscarPorEmail(email);

    if (!usuario || !usuario.activo || usuario.passwordHash === null) {
      // Compara igual contra un hash del mismo costo: el tiempo no revela qué correos existen.
      await this.hasher.verificar(password, await this.obtenerHashFicticio());
      throw new ErrorDeAplicacion('CREDENCIALES_INVALIDAS', CREDENCIALES_INVALIDAS);
    }

    // Bloqueado: no se verifica la contraseña ni se suman intentos.
    if (estaBloqueado(usuario.bloqueo, ahora)) {
      throw new ErrorDeAplicacion('CUENTA_BLOQUEADA', CUENTA_BLOQUEADA);
    }

    if (!(await this.hasher.verificar(password, usuario.passwordHash))) {
      const fallo = registrarFallo(usuario.bloqueo, ahora);
      await this.usuarios.guardarBloqueo(usuario.id, fallo.estado);
      if (fallo.bloqueado) {
        throw new ErrorDeAplicacion('CUENTA_BLOQUEADA', CUENTA_BLOQUEADA);
      }
      throw new ErrorDeAplicacion('CREDENCIALES_INVALIDAS', CREDENCIALES_INVALIDAS);
    }

    if (usuario.bloqueo.intentosFallidos !== 0 || usuario.bloqueo.bloqueadoHasta !== null) {
      await this.usuarios.guardarBloqueo(usuario.id, registrarExito());
    }

    // SPEC 16: solo con la contraseña correcta, así quien no la conoce no sabe si la cuenta está verificada.
    if (!usuario.correoVerificado) {
      throw new ErrorDeAplicacion('CORREO_NO_VERIFICADO', CORREO_NO_VERIFICADO);
    }

    const datos: UsuarioSesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      dependenciaId: usuario.dependenciaId,
    };
    return abrirSesion(this.tokens, this.sesiones, datos, ahora);
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

  // Idempotente: no revela si el token existía.
  async cerrarSesion(refreshToken: string): Promise<void> {
    const ahora = this.clock.now();
    const sesion = await this.sesiones.buscarPorHash(this.tokens.hashRenovacion(refreshToken));
    if (sesion && sesion.revocadaEn === null && sesion.expiraEn.getTime() > ahora.getTime()) {
      await this.sesiones.revocar(sesion.id, ahora);
    }
  }

  // Se calcula una vez con el mismo hasher, para que tenga el mismo costo que los hashes reales.
  private obtenerHashFicticio(): Promise<string> {
    this.hashFicticio ??= this.hasher.hash('contraseña-ficticia-para-igualar-tiempos');
    return this.hashFicticio;
  }
}
