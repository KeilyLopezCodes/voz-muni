import { calcularCambios } from '../../domain/auditoria/saneamiento';
import type { PasswordHasher } from '../../domain/auth/password-hasher';
import { type TokenService, VIGENCIA_RESTABLECIMIENTO_MS } from '../../domain/auth/token-service';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Clock } from '../../domain/health/clock';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { NuevoRegistro } from '../../domain/repositories/registro-vecino-repository';
import type { ReposTransaccionales } from '../../domain/repositories/transaccion';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { type DatosRegistro, decidirCasoRegistro, validarRegistro } from '../../domain/usuarios/registro-vecino';
import { ErrorDeAplicacion, conReglasDeNegocio } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';

const TOKEN_INVALIDO = 'El enlace de verificación no existe, venció o ya se usó';
// Sin usuario conocido (el correo ingresado no tiene cuenta): el log del envío lo indica con 0.
const SIN_USUARIO = 0;

// Qué correo corresponde al caso. Se encola en la transacción del registro (SPEC 34); la respuesta HTTP no espera
// al envío.
type Aviso =
  | { clave: 'verificacion_correo'; usuarioId: number; nombre: string; token: string }
  | { clave: 'cuenta_existente' | 'registro_no_completado'; usuarioId: number }
  | null;

// Registro del vecino en el portal y verificación de su correo (RF-01, SPEC 16). Bitácora (SPEC 42):
// usuario.registrar solo cuando se crea una cuenta nueva, y usuario.verificar_correo; globales (sin dependencia).
export class RegistroVecinosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly correo: NotificadorCorreo,
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

    const correoId = await this.decidirYAplicar(nuevo, ahora);
    await this.correo.despachar([correoId]);
  }

  // Devuelve el id del correo encolado, o null si no corresponde ninguno.
  private async decidirYAplicar(nuevo: NuevoRegistro, ahora: Date): Promise<number | null> {
    try {
      return await this.transaccion.ejecutar(async (repos) =>
        this.encolar(await this.decidir(repos, nuevo, ahora), nuevo.email, ahora, repos.correosSalientes),
      );
    } catch (error) {
      // Otro registro con el mismo correo o DPI ganó la carrera entre la búsqueda y el INSERT (23505).
      // La transacción se revirtió: el aviso se encola fuera de ella.
      if (error instanceof ReglaDeNegocioError && error.codigo === 'EMAIL_DUPLICADO') {
        return this.encolar({ clave: 'cuenta_existente', usuarioId: SIN_USUARIO }, nuevo.email, ahora);
      }
      if (error instanceof ReglaDeNegocioError && error.codigo === 'DPI_DUPLICADO') {
        return this.encolar({ clave: 'registro_no_completado', usuarioId: SIN_USUARIO }, nuevo.email, ahora);
      }
      throw error;
    }
  }

  private async decidir(repos: ReposTransaccionales, nuevo: NuevoRegistro, ahora: Date): Promise<Aviso> {
    const { porCorreo, porDpi } = await repos.registroVecinos.buscarParaRegistro(nuevo.email, nuevo.dpi);
    const decision = decidirCasoRegistro(porCorreo, porDpi);

    switch (decision.caso) {
      case 'nuevo': {
        const { id } = await repos.registroVecinos.crearPendiente(nuevo);
        // El saneamiento enmascara el DPI, el teléfono y el correo, y nunca guarda la contraseña.
        await repos.auditoria.registrar({
          accion: 'usuario.registrar',
          entidadId: id,
          usuarioId: id,
          dependenciaId: null,
          cambios: calcularCambios(null, { nombre: nuevo.nombre, dpi: nuevo.dpi, email: nuevo.email, telefono: nuevo.telefono }),
        });
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
  }

  private encolar(aviso: Aviso, email: string, ahora: Date, correos?: CorreoSalienteRepository): Promise<number | null> {
    if (aviso === null) {
      return Promise.resolve(null);
    }
    // SIN_USUARIO no es un usuario: el correo no lo referencia.
    const usuarioId = aviso.usuarioId === SIN_USUARIO ? undefined : aviso.usuarioId;
    if (aviso.clave === 'verificacion_correo') {
      const enlace = `${this.appUrl}/verificar?token=${aviso.token}`;
      return this.correo.encolar(
        aviso.clave,
        { nombre: aviso.nombre, enlace },
        { para: email, usuarioId, expiraEn: new Date(ahora.getTime() + VIGENCIA_RESTABLECIMIENTO_MS.verificacion) },
        correos,
      );
    }
    return this.correo.encolar(aviso.clave, {}, { para: email, usuarioId }, correos);
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
      await repos.auditoria.registrar({ accion: 'usuario.verificar_correo', entidadId: usuario.id, usuarioId: usuario.id, dependenciaId: null });
    });
  }
}
