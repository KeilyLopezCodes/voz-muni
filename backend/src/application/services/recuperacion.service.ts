import type { PasswordHasher } from '../../domain/auth/password-hasher';
import { validarPassword } from '../../domain/auth/politica-password';
import { type TokenService, VIGENCIA_RESTABLECIMIENTO_MS } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { RestablecimientoRepository } from '../../domain/repositories/restablecimiento-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioRepository } from '../../domain/repositories/usuario-repository';
import type { RespuestaSesion, UsuarioSesion } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { abrirSesion } from './emision-sesion';
import type { NotificadorCorreo } from './notificador-correo.service';

const TOKEN_INVALIDO = 'El enlace de recuperación no existe, venció o ya se usó';
// Los enlaces que acepta /auth/restablecer. Los de verificación de correo van a /auth/verificar (SPEC 16).
const TIPOS_RESTABLECER = ['recuperacion', 'invitacion'] as const;

// Recuperación de contraseña por correo (RF-03). Bitácora (SPEC 42): password.solicitar solo para una cuenta que
// recibe el enlace, y password.definir con el tipo del enlace (recuperación o invitación, SPEC 10 y 13); la sesión
// que devuelve restablecer no deja además un sesion.iniciar.
export class RecuperacionService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly restablecimientos: RestablecimientoRepository,
    private readonly transaccion: Transaccion,
    private readonly correo: NotificadorCorreo,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  // Nunca revela si el correo existe: termina igual en todos los casos, y el correo sale sin esperar.
  async solicitar(email: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorEmail(email);
    // Cualquier usuario activo con correo recibe el enlace, tenga o no contraseña y sea interno o vecino (SPEC 13):
    // así quien tiene la invitación vencida obtiene otro enlace.
    if (!usuario || !usuario.activo) {
      return;
    }

    const ahora = this.clock.now();
    const correoId = await this.transaccion.ejecutar(async (repos) => {
      // Solo sirve el último enlace pedido.
      await repos.restablecimientos.invalidarPendientes(usuario.id, ahora);
      const token = this.tokens.generarRenovacion();
      await repos.restablecimientos.crear(usuario.id, this.tokens.hashRenovacion(token), 'recuperacion', ahora);

      const enlace = `${this.appUrl}/restablecer?token=${token}`;
      // Con el vencimiento del enlace: si no sale a tiempo, se descarta en lugar de enviarse (SPEC 34).
      const id = await this.correo.encolar(
        'recuperacion_password',
        { nombre: usuario.nombre, enlace },
        { para: email, usuarioId: usuario.id, expiraEn: new Date(ahora.getTime() + VIGENCIA_RESTABLECIMIENTO_MS.recuperacion) },
        repos.correosSalientes,
      );
      await repos.auditoria.registrar({ accion: 'password.solicitar', entidadId: usuario.id, usuarioId: usuario.id, dependenciaId: null });
      return id;
    });
    await this.correo.despachar([correoId]);
  }

  async restablecer(token: string, password: string): Promise<RespuestaSesion> {
    // Antes de buscar el token: una contraseña débil no consume el enlace.
    const motivo = validarPassword(password);
    if (motivo) {
      throw new ErrorDeAplicacion('POLITICA_PASSWORD', motivo);
    }

    const tokenHash = this.tokens.hashRenovacion(token);
    const ahora = this.clock.now();
    const vigente = await this.restablecimientos.buscarVigente(tokenHash, ahora, TIPOS_RESTABLECER);
    const usuario = vigente ? await this.usuarios.buscarActivo(vigente.usuarioId) : null;
    if (!vigente || !usuario) {
      throw new ErrorDeAplicacion('TOKEN_RECUPERACION_INVALIDO', TOKEN_INVALIDO);
    }

    // bcrypt es lento: se calcula fuera de la transacción.
    const passwordHash = await this.hasher.hash(password);
    const datos: UsuarioSesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      dependenciaId: usuario.dependenciaId,
    };

    const respuesta = await this.transaccion.ejecutar(async (repos) => {
      // Otra petición pudo usar el mismo token mientras se calculaba el hash.
      const sigueVigente = await repos.restablecimientos.buscarVigente(tokenHash, ahora, TIPOS_RESTABLECER);
      if (!sigueVigente) {
        throw new ErrorDeAplicacion('TOKEN_RECUPERACION_INVALIDO', TOKEN_INVALIDO);
      }
      await repos.usuarios.cambiarPassword(usuario.id, passwordHash);
      // Usar un enlace enviado al correo prueba que el correo es suyo (SPEC 16).
      await repos.registroVecinos.marcarVerificado(usuario.id, ahora);
      await repos.restablecimientos.marcarUsado(sigueVigente.id, ahora);
      // La única sesión viva queda siendo la nueva.
      await repos.sesiones.revocarTodasDelUsuario(usuario.id, ahora);
      await repos.auditoria.registrar({
        accion: 'password.definir',
        entidadId: usuario.id,
        usuarioId: usuario.id,
        dependenciaId: null,
        datos: { tipo: sigueVigente.tipo },
      });
      return abrirSesion(this.tokens, repos.sesiones, datos, ahora);
    });

    // La primera contraseña, definida con una invitación, no lleva aviso de cambio (SPEC 10).
    const email = vigente.tipo === 'recuperacion' ? await this.usuarios.emailDe(usuario.id) : null;
    if (email) {
      // La contraseña ya cambió: el aviso se encola después, fuera de la transacción.
      const correoId = await this.correo.encolar('password_cambiado', { nombre: usuario.nombre }, { para: email, usuarioId: usuario.id });
      await this.correo.despachar([correoId]);
    }
    return respuesta;
  }
}
