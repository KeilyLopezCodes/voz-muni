import type { TokenService } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../domain/repositories/vecino-repository';
import { normalizarDpi } from '../../domain/usuarios/usuario-interno';
import { type DatosVecinoNuevo, normalizarTelefono, validarVecinoNuevo } from '../../domain/usuarios/vecino';
import type { VecinoEncontrado } from '../dto/registro-ticket.dto';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';

export const MAX_VECINOS_ENCONTRADOS = 10;

// a***@dominio.gt: primer carácter + *** + @dominio.
export function enmascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  return `${email.charAt(0)}***${email.slice(arroba)}`;
}

// ****0000: solo los 4 últimos dígitos.
export function enmascararTelefono(telefono: string): string {
  return `****${telefono.replace(/\D/g, '').slice(-4)}`;
}

function aEncontrado(vecino: Vecino): VecinoEncontrado {
  return {
    id: vecino.id,
    nombre: vecino.nombre,
    email: vecino.email === null ? null : enmascararEmail(vecino.email),
    telefono: vecino.telefono === null ? null : enmascararTelefono(vecino.telefono),
  };
}

export interface VecinoCreadoDto {
  vecino: VecinoEncontrado;
  invitacionEnviada: boolean;
}

// Búsqueda (SPEC 12) y alta en ventanilla (SPEC 13) de vecinos. El DPI nunca se devuelve (RNF-12).
export class VecinosService {
  constructor(
    private readonly vecinos: VecinoRepository,
    private readonly transaccion: Transaccion,
    private readonly correo: EnvioCorreo,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  async buscar(criterio: CriterioVecino): Promise<{ datos: VecinoEncontrado[] }> {
    return conReglasDeNegocio(async () => {
      // Se normaliza igual que al guardar: 5555-0000 encuentra a 55550000.
      const normalizado: CriterioVecino =
        'email' in criterio
          ? { email: criterio.email.toLowerCase() }
          : 'dpi' in criterio
            ? { dpi: normalizarDpi(criterio.dpi) }
            : { telefono: normalizarTelefono(criterio.telefono) };
      const encontrados = await this.vecinos.buscarActivos(normalizado, MAX_VECINOS_ENCONTRADOS);
      return { datos: encontrados.map(aEncontrado) };
    });
  }

  // Crea el vecino activo y sin contraseña. Si dio correo, lo invita a definir su contraseña (24 h).
  async crear(datos: DatosVecinoNuevo): Promise<VecinoCreadoDto> {
    return conReglasDeNegocio(async () => {
      const vecino = validarVecinoNuevo(datos);
      const ahora = this.clock.now();
      const token = this.tokens.generarRenovacion();

      const { id } = await this.transaccion.ejecutar(async (repos) => {
        const creado = await repos.vecinos.crear(vecino);
        if (vecino.email !== null) {
          await repos.restablecimientos.crear(creado.id, this.tokens.hashRenovacion(token), 'invitacion', ahora);
        }
        return creado;
      });

      // Se espera el envío para avisar al receptor si falló; el vecino ya quedó creado.
      const invitacionEnviada =
        vecino.email !== null &&
        (await this.correo.intentar(
          'invitacion_vecino',
          vecino.email,
          { nombre: vecino.nombre, enlace: `${this.appUrl}/restablecer?token=${token}` },
          id,
        ));
      return {
        vecino: aEncontrado({ id, nombre: vecino.nombre, email: vecino.email, telefono: vecino.telefono }),
        invitacionEnviada,
      };
    });
  }
}
