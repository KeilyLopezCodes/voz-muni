import { calcularCambios } from '../../domain/auditoria/saneamiento';
import { type TokenService, VIGENCIA_RESTABLECIMIENTO_MS } from '../../domain/auth/token-service';
import type { Clock } from '../../domain/health/clock';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../domain/repositories/vecino-repository';
import { enmascararEmail, enmascararTelefono } from '../../domain/usuarios/enmascarar-contacto';
import { normalizarDpi } from '../../domain/usuarios/usuario-interno';
import { type DatosVecinoNuevo, normalizarTelefono, validarVecinoNuevo } from '../../domain/usuarios/vecino';
import type { VecinoEncontrado } from '../dto/registro-ticket.dto';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';

export const MAX_VECINOS_ENCONTRADOS = 10;

export { enmascararEmail, enmascararTelefono };

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
    private readonly correo: NotificadorCorreo,
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
  async crear(actorId: number, datos: DatosVecinoNuevo): Promise<VecinoCreadoDto> {
    return conReglasDeNegocio(async () => {
      const vecino = validarVecinoNuevo(datos);
      const ahora = this.clock.now();
      const token = this.tokens.generarRenovacion();

      const { id, correoId } = await this.transaccion.ejecutar(async (repos) => {
        const creado = await repos.vecinos.crear(vecino);
        // El alta en ventanilla se registra como usuario.crear, sin dependencia (SPEC 41).
        await repos.auditoria.registrar({
          accion: 'usuario.crear',
          entidadId: creado.id,
          usuarioId: actorId,
          dependenciaId: null,
          cambios: calcularCambios(null, {
            nombre: vecino.nombre,
            email: vecino.email,
            telefono: vecino.telefono,
            dpi: vecino.dpi,
            rol: 'vecino',
          }),
        });
        if (vecino.email === null) {
          return { id: creado.id, correoId: null };
        }
        await repos.restablecimientos.crear(creado.id, this.tokens.hashRenovacion(token), 'invitacion', ahora);
        // La invitación se encola en la misma transacción (SPEC 34), con el vencimiento del enlace.
        const correo = await this.correo.encolar(
          'invitacion_vecino',
          { nombre: vecino.nombre, enlace: `${this.appUrl}/restablecer?token=${token}` },
          {
            para: vecino.email,
            usuarioId: creado.id,
            expiraEn: new Date(ahora.getTime() + VIGENCIA_RESTABLECIMIENTO_MS.invitacion),
          },
          repos.correosSalientes,
        );
        return { id: creado.id, correoId: correo };
      });

      // Se espera el primer intento para avisar al receptor si falló; el vecino ya quedó creado y el job de correos
      // lo reintenta.
      const invitacionEnviada = vecino.email !== null && (await this.correo.despacharYEsperar([correoId]));
      return {
        vecino: aEncontrado({ id, nombre: vecino.nombre, email: vecino.email, telefono: vecino.telefono }),
        invitacionEnviada,
      };
    });
  }
}
