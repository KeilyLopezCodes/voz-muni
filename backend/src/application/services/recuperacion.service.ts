import type { PasswordHasher } from '../../domain/auth/password-hasher';
import { validarPassword } from '../../domain/auth/politica-password';
import { DURACION_RESTABLECIMIENTO_MS, type TokenService } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { EnviadorCorreo } from '../../domain/notificaciones/enviador-correo';
import { renderizar } from '../../domain/notificaciones/plantilla';
import type { PlantillaRepository } from '../../domain/repositories/plantilla-repository';
import type { RestablecimientoRepository } from '../../domain/repositories/restablecimiento-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioRepository } from '../../domain/repositories/usuario-repository';
import type { RespuestaSesion, UsuarioSesion } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { abrirSesion } from './emision-sesion';

const TOKEN_INVALIDO = 'El enlace de recuperación no existe, venció o ya se usó';

export interface OpcionesRecuperacion {
  appUrl: string; // APP_URL, sin barra final
  registrarError: (mensaje: string) => void;
}

// Recuperación de contraseña por correo (RF-03).
export class RecuperacionService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly restablecimientos: RestablecimientoRepository,
    private readonly plantillas: PlantillaRepository,
    private readonly transaccion: Transaccion,
    private readonly enviador: EnviadorCorreo,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly opciones: OpcionesRecuperacion,
  ) {}

  // Nunca revela si el correo existe: termina igual en todos los casos, y el correo sale sin esperar.
  async solicitar(email: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorEmail(email);
    if (!usuario || !usuario.activo || usuario.passwordHash === null) {
      return;
    }

    const ahora = this.clock.now();
    // Solo sirve el último enlace pedido.
    await this.restablecimientos.invalidarPendientes(usuario.id, ahora);
    const token = this.tokens.generarRenovacion();
    await this.restablecimientos.crear(
      usuario.id,
      this.tokens.hashRenovacion(token),
      new Date(ahora.getTime() + DURACION_RESTABLECIMIENTO_MS),
    );

    const enlace = `${this.opciones.appUrl}/restablecer?token=${token}`;
    this.enviarSinEsperar('recuperacion_password', email, { nombre: usuario.nombre, enlace }, usuario.id);
  }

  async restablecer(token: string, password: string): Promise<RespuestaSesion> {
    // Antes de buscar el token: una contraseña débil no consume el enlace.
    const motivo = validarPassword(password);
    if (motivo) {
      throw new ErrorDeAplicacion('POLITICA_PASSWORD', motivo);
    }

    const tokenHash = this.tokens.hashRenovacion(token);
    const ahora = this.clock.now();
    const vigente = await this.restablecimientos.buscarVigente(tokenHash, ahora);
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
      const sigueVigente = await repos.restablecimientos.buscarVigente(tokenHash, ahora);
      if (!sigueVigente) {
        throw new ErrorDeAplicacion('TOKEN_RECUPERACION_INVALIDO', TOKEN_INVALIDO);
      }
      await repos.usuarios.cambiarPassword(usuario.id, passwordHash);
      await repos.restablecimientos.marcarUsado(sigueVigente.id, ahora);
      // La única sesión viva queda siendo la nueva.
      await repos.sesiones.revocarTodasDelUsuario(usuario.id, ahora);
      return abrirSesion(this.tokens, repos.sesiones, datos, ahora);
    });

    const email = await this.usuarios.emailDe(usuario.id);
    if (email) {
      this.enviarSinEsperar('password_cambiado', email, { nombre: usuario.nombre }, usuario.id);
    }
    return respuesta;
  }

  // El fallo del envío no llega al cliente: queda en el log con el usuario_id y sin el token.
  private enviarSinEsperar(clave: string, para: string, variables: Record<string, string>, usuarioId: number): void {
    void this.enviar(clave, para, variables).catch((error: unknown) => {
      const detalle = error instanceof Error ? error.message : String(error);
      this.opciones.registrarError(`No se pudo enviar el correo ${clave} al usuario_id ${usuarioId}: ${detalle}`);
    });
  }

  private async enviar(clave: string, para: string, variables: Record<string, string>): Promise<void> {
    // Se lee en cada envío: un cambio de la plantilla en la base aplica sin reiniciar.
    const plantilla = await this.plantillas.buscarPorClave(clave);
    if (!plantilla) {
      throw new Error(`No existe la plantilla ${clave}`);
    }
    const correo = renderizar(plantilla, variables);
    await this.enviador.enviar({ para, asunto: correo.asunto, texto: correo.texto, html: correo.html });
  }
}
