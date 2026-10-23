import type { PasswordHasher } from '../../domain/auth/password-hasher';
import type { TokenService } from '../../domain/auth/token-service';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Clock } from '../../domain/health/clock';
import type { NuevoRegistro } from '../../domain/repositories/registro-vecino-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { type DatosRegistro, decidirCasoRegistro, validarRegistro } from '../../domain/usuarios/registro-vecino';
import { ErrorDeAplicacion, conReglasDeNegocio } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';

const TOKEN_INVALIDO = 'El enlace de verificación no existe, venció o ya se usó';
// Sin usuario conocido (el correo ingresado no tiene cuenta): el log del envío lo indica con 0.
const SIN_USUARIO = 0;

// Lo que queda por enviar cuando la transacción terminó. La respuesta HTTP no espera al correo.
type Aviso =
  | { clave: 'verificacion_correo'; usuarioId: number; nombre: string; token: string }
  | { clave: 'cuenta_existente' | 'registro_no_completado'; usuarioId: number }
  | null;

// Registro del vecino en el portal y verificación de su correo (RF-01, SPEC 16).
export class RegistroVecinosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly correo: EnvioCorreo,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  // Termina igual en los 5 casos: no revela si el correo o el DPI ya existen. El correo sale sin esperar.
  async registrar(datos: DatosRegistro): Promise<void> {
    const valido = await conReglasDeNegocio(async () => validarRegistro(datos));
    // bcrypt se calcula siempre, aunque el caso no lo use: así el tiempo de respuesta tampoco delata el caso.
    const passwordHash = await this.hasher.hash(valido.password);
    const nuevo: NuevoRegistro = {
      nombre: valido.nombre,
      dpi: valido.dpi,
      email: valido.email,
      telefono: valido.telefono,
      passwordHash,
    };
    const ahora = this.clock.now();

    const aviso = await this.decidirYAplicar(nuevo, ahora);
    this.enviar(aviso, valido.email);
  }

  private async decidirYAplicar(nuevo: NuevoRegistro, ahora: Date): Promise<Aviso> {
    try {
      return await this.transaccion.ejecutar(async (repos) => {
        const { porCorreo, porDpi } = await repos.registroVecinos.buscarParaRegistro(nuevo.email, nuevo.dpi);
        const decision = decidirCasoRegistro(porCorreo, porDpi);

        switch (decision.caso) {
          case 'nuevo': {
            const { id } = await repos.registroVecinos.crearPendiente(nuevo);
            const token = this.tokens.generarRenovacion();
            await repos.restablecimientos.crear(id, this.tokens.hashRenovacion(token), 'verificacion', ahora);
            return { clave: 'verificacion_correo', usuarioId: id, nombre: nuevo.nombre, token };
          }
          case 'reemplazar_pendiente': {
            await repos.registroVecinos.reemplazarPendiente(decision.usuarioId, nuevo);
            // Solo sirve el enlace nuevo.
            await repos.restablecimientos.invalidarPendientes(decision.usuarioId, ahora);
            const token = this.tokens.generarRenovacion();
            await repos.restablecimientos.crear(decision.usuarioId, this.tokens.hashRenovacion(token), 'verificacion', ahora);
            return { clave: 'verificacion_correo', usuarioId: decision.usuarioId, nombre: nuevo.nombre, token };
          }
          case 'cuenta_existente':
            return { clave: 'cuenta_existente', usuarioId: porCorreo!.id };
          case 'dpi_ajeno':
            return { clave: 'registro_no_completado', usuarioId: porCorreo?.id ?? SIN_USUARIO };
          case 'inactivo':
            return null;
        }
      });
    } catch (error) {
      // Otro registro con el mismo correo o DPI ganó la carrera entre la búsqueda y el INSERT (23505).
      if (error instanceof ReglaDeNegocioError && error.codigo === 'EMAIL_DUPLICADO') {
        return { clave: 'cuenta_existente', usuarioId: SIN_USUARIO };
      }
      if (error instanceof ReglaDeNegocioError && error.codigo === 'DPI_DUPLICADO') {
        return { clave: 'registro_no_completado', usuarioId: SIN_USUARIO };
      }
      throw error;
    }
  }

  private enviar(aviso: Aviso, email: string): void {
    if (aviso === null) {
      return;
    }
    if (aviso.clave === 'verificacion_correo') {
      const enlace = `${this.appUrl}/verificar?token=${aviso.token}`;
      this.correo.sinEsperar(aviso.clave, email, { nombre: aviso.nombre, enlace }, aviso.usuarioId);
      return;
    }
    this.correo.sinEsperar(aviso.clave, email, {}, aviso.usuarioId);
  }

  async verificar(token: string): Promise<void> {
    const tokenHash = this.tokens.hashRenovacion(token);
    const ahora = this.clock.now();
    await this.transaccion.ejecutar(async (repos) => {
      // Solo enlaces de verificación: los de recuperación e invitación se usan en /auth/restablecer.
      const vigente = await repos.restablecimientos.buscarVigente(tokenHash, ahora, ['verificacion']);
      const usuario = vigente ? await repos.usuarios.buscarActivo(vigente.usuarioId) : null;
      if (!vigente || !usuario) {
        throw new ErrorDeAplicacion('TOKEN_VERIFICACION_INVALIDO', TOKEN_INVALIDO);
      }
      await repos.registroVecinos.marcarVerificado(usuario.id, ahora);
      await repos.restablecimientos.marcarUsado(vigente.id, ahora);
    });
  }
}
