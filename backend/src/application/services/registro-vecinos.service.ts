import type { PasswordHasher } from '../../domain/auth/password-hasher';
import type { TokenService } from '../../domain/auth/token-service';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Clock } from '../../domain/health/clock';
import type { Transaccion } from '../../domain/repositories/transaccion';
import {
  type CasoRegistro,
  type DatosRegistroVecino,
  decidirCasoRegistro,
  validarRegistro,
} from '../../domain/usuarios/registro-vecino';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';

export const MENSAJE_REGISTRO = 'Revisa tu correo para continuar.';
export const MENSAJE_VERIFICADO = 'Correo verificado. Ya puedes iniciar sesión.';

// Correo que se envía en cada caso: la respuesta HTTP es la misma en todos.
interface Aviso {
  clave: string;
  variables: Record<string, string>;
  usuarioId: number | null;
}

// Registro propio del vecino con verificación de correo (RF-01, SPEC 16).
export class RegistroVecinosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly correo: EnvioCorreo,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  // Nunca revela si el correo o el DPI existen: termina igual en todos los casos y el correo sale sin esperar.
  async registrar(datos: DatosRegistroVecino): Promise<{ mensaje: string }> {
    const registro = await conReglasDeNegocio(async () => validarRegistro(datos));
    // Se calcula siempre, también en los casos que no lo usan: el tiempo de respuesta no delata el caso.
    const passwordHash = await this.hasher.hash(registro.password);
    const ahora = this.clock.now();

    let aviso: Aviso | null;
    try {
      aviso = await this.transaccion.ejecutar(async (repos) => {
        const porCorreo = await repos.registroVecinos.buscarPorCorreo(registro.email);
        const porDpi = await repos.registroVecinos.buscarPorDpi(registro.dpi);
        const caso = decidirCasoRegistro(porCorreo, porDpi);

        if (caso === 1 || caso === 2) {
          const cuenta = { nombre: registro.nombre, dpi: registro.dpi, telefono: registro.telefono, passwordHash };
          let usuarioId: number;
          if (caso === 1) {
            usuarioId = (await repos.registroVecinos.crear({ ...cuenta, email: registro.email })).id;
          } else {
            usuarioId = porCorreo!.id;
            await repos.registroVecinos.reemplazarPendiente(usuarioId, cuenta);
            // Solo sirve el último enlace.
            await repos.restablecimientos.invalidarPendientes(usuarioId, ahora);
          }
          const token = this.tokens.generarRenovacion();
          await repos.restablecimientos.crear(usuarioId, this.tokens.hashRenovacion(token), 'verificacion', ahora);
          return {
            clave: 'verificacion_correo',
            variables: { nombre: registro.nombre, enlace: `${this.appUrl}/verificar?token=${token}` },
            usuarioId,
          };
        }
        return this.avisoSinCambios(caso, porCorreo?.id ?? null);
      });
    } catch (error) {
      // Otro registro simultáneo tomó el correo o el DPI: se trata como el caso que corresponde, sin cambiar la respuesta.
      if (error instanceof ReglaDeNegocioError && error.codigo === 'EMAIL_DUPLICADO') {
        aviso = this.avisoSinCambios(3, null);
      } else if (error instanceof ReglaDeNegocioError && error.codigo === 'DPI_DUPLICADO') {
        aviso = this.avisoSinCambios(4, null);
      } else {
        throw error;
      }
    }

    if (aviso) {
      this.correo.sinEsperar(aviso.clave, registro.email, aviso.variables, aviso.usuarioId);
    }
    return { mensaje: MENSAJE_REGISTRO };
  }

  async verificar(token: string): Promise<{ mensaje: string }> {
    const ahora = this.clock.now();
    const tokenHash = this.tokens.hashRenovacion(token);
    await this.transaccion.ejecutar(async (repos) => {
      const vigente = await repos.restablecimientos.buscarVigente(tokenHash, ahora, ['verificacion']);
      const usuario = vigente ? await repos.usuarios.buscarActivo(vigente.usuarioId) : null;
      if (!vigente || !usuario) {
        throw new ErrorDeAplicacion(
          'TOKEN_VERIFICACION_INVALIDO',
          'El enlace de verificación no existe, venció o ya se usó',
        );
      }
      await repos.usuarios.marcarCorreoVerificado(usuario.id, ahora);
      await repos.restablecimientos.marcarUsado(vigente.id, ahora);
    });
    return { mensaje: MENSAJE_VERIFICADO };
  }

  // Casos 3, 4 y 5: no se crea ni se modifica nada.
  private avisoSinCambios(caso: CasoRegistro, usuarioId: number | null): Aviso | null {
    if (caso === 3) return { clave: 'cuenta_existente', variables: {}, usuarioId };
    if (caso === 4) return { clave: 'registro_no_completado', variables: {}, usuarioId: null };
    return null;
  }
}
