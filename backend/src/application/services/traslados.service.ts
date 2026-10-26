import type { Alcance } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../domain/errors/invalid-transition-error';
import type { Clock } from '../../domain/health/clock';
import type {
  CatalogoLecturaRepository,
  DependenciaActiva,
} from '../../domain/repositories/catalogo-lectura-repository';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { SolicitudTraslado } from '../../domain/repositories/traslado-repository';
import type { ResultadoTraslado } from '../../domain/notificaciones/tipos-notificacion';
import type { ReposTransaccionales, Transaccion } from '../../domain/repositories/transaccion';
import {
  type EstadoSolicitud,
  exigirPendiente,
  MOTIVO_TRASLADO_MAX,
  puedeTrasladarse,
  validarSolicitud,
} from '../../domain/traslado/solicitud-traslado';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { DatosSolicitudTraslado, ResultadoTrasladoDto, SolicitudTrasladoDto } from '../dto/traslados.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';
import type { NotificacionesInternasService } from './notificaciones-internas.service';

const aDto = (s: SolicitudTraslado): SolicitudTrasladoDto => ({
  ...s,
  creadoEn: s.creadoEn.toISOString(),
  resueltoEn: s.resueltoEn ? s.resueltoEn.toISOString() : null,
});

// Traslados entre dependencias (RF-15, SPEC 21). El técnico y el coordinador solicitan (alcance `solicitar`);
// el supervisor (alcance `todas`) aprueba, rechaza o traslada directo. Aprobar aplica Ticket.trasladar (SPEC 04):
// la queja vuelve a en_revision sin dependencia ni técnico, y el vecino recibe queja_trasladada (SPEC 35).
export class TrasladosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly catalogo: CatalogoLecturaRepository,
    private readonly clock: Clock,
    private readonly correo: NotificadorCorreo,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly notificaciones: Pick<NotificacionesInternasService, 'notificar'>, // SPEC 36
  ) {}

  async solicitar(
    usuario: UsuarioAutenticado,
    alcance: Alcance,
    ticketId: number,
    datos: DatosSolicitudTraslado,
  ): Promise<ResultadoTrasladoDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.trasladar');
    const { resultado, correoId } = await conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async (repos) => {
        const { ticketsEscritura, traslados, correosSalientes } = repos;
        // FOR UPDATE sobre el ticket, con el alcance: el técnico ve sus asignadas, el coordinador su dependencia.
        const actual = await ticketsEscritura.obtenerParaActualizar(ticketId, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
        }
        const { ticket } = actual;
        if (!puedeTrasladarse(ticket.estado) || ticket.dependenciaId === null) {
          throw new InvalidTransitionError(ticket.estado, 'en_revision');
        }
        const dependenciaSugeridaId = datos.dependenciaSugeridaId ?? null;
        const { motivo } = validarSolicitud({
          motivo: datos.motivo,
          dependenciaOrigenId: ticket.dependenciaId,
          dependenciaSugeridaId,
        });
        if (dependenciaSugeridaId !== null && !(await traslados.dependenciaActiva(dependenciaSugeridaId))) {
          throw new ErrorDeAplicacion('DEPENDENCIA_INVALIDA', 'La dependencia sugerida no existe o está inactiva');
        }
        const nueva = {
          ticketId: ticket.id,
          solicitadoPor: usuario.id,
          dependenciaOrigenId: ticket.dependenciaId,
          dependenciaSugeridaId,
          motivo,
        };

        if (alcance !== 'todas') {
          const id = await traslados.crear({ ...nueva, resolucion: null });
          // Decide el supervisor (SPEC 36).
          await this.notificaciones.notificar(
            repos,
            { tipo: 'traslado_solicitado', ticketId: ticket.id, autorId: usuario.id, candidatos: { supervisores: true }, datos: { solicitudId: id } },
            this.clock.now(),
          );
          // Una solicitud pendiente no cambia la queja: el vecino no recibe nada.
          return { resultado: { solicitud: aDto((await traslados.obtener(id))!) }, correoId: null };
        }
        // El supervisor traslada en el momento, y queda registrado como solicitud aprobada por él mismo.
        const ahora = this.clock.now();
        const resultado = ticket.trasladar({ actorId: usuario.id, ahora }, motivo);
        const id = await traslados.crear({
          ...nueva,
          resolucion: { estado: 'aprobada', resueltoPor: usuario.id, resueltoEn: ahora },
        });
        // El técnico pierde la queja: se le avisa antes de guardar el traslado (SPEC 36).
        await this.notificarResuelto(repos, ticket.id, usuario.id, [ticket.asignadoA], id, 'aprobada', ahora);
        await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
        return {
          resultado: {
            solicitud: aDto((await traslados.obtener(id))!),
            ticket: { id: ticket.id, numero: ticket.numero, estado: 'en_revision' as const },
          },
          correoId: await this.encolarTrasladada(actual, correosSalientes),
        };
      }),
    );
    await this.correo.despachar([correoId]);
    return resultado;
  }

  async aprobar(usuario: UsuarioAutenticado, id: number): Promise<ResultadoTrasladoDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.trasladar');
    const resultado = await conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async (repos) => {
        const { ticketsEscritura, traslados, correosSalientes } = repos;
        const solicitud = await this.pendiente(traslados, id);
        const actual = await ticketsEscritura.obtenerParaActualizar(solicitud.ticketId, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la solicitud ${id}`);
        }
        const ahora = this.clock.now();
        // La queja siguió su curso mientras estaba pendiente: si ya no se puede trasladar, la solicitud queda
        // sin efecto. Se guarda (commit) y después se responde 409.
        if (!puedeTrasladarse(actual.ticket.estado)) {
          await traslados.resolver(id, {
            estado: 'sin_efecto',
            resueltoPor: usuario.id,
            motivoResolucion: null,
            resueltoEn: ahora,
          });
          await this.notificarResuelto(repos, actual.ticket.id, usuario.id, [solicitud.solicitadoPor], id, 'sin_efecto', ahora);
          return null;
        }
        const transicion = actual.ticket.trasladar({ actorId: usuario.id, ahora }, solicitud.motivo);
        // Antes de guardar: el solicitante y el técnico pierden la queja con el traslado (SPEC 36).
        await this.notificarResuelto(
          repos,
          actual.ticket.id,
          usuario.id,
          [solicitud.solicitadoPor, actual.ticket.asignadoA],
          id,
          'aprobada',
          ahora,
        );
        await ticketsEscritura.guardarTransicion(transicion, actual.categoria.id);
        await traslados.resolver(id, {
          estado: 'aprobada',
          resueltoPor: usuario.id,
          motivoResolucion: null,
          resueltoEn: ahora,
        });
        return {
          solicitud: aDto((await traslados.obtener(id))!),
          ticket: { id: actual.ticket.id, numero: actual.ticket.numero, estado: 'en_revision' as const },
          correoId: await this.encolarTrasladada(actual, correosSalientes),
        };
      }),
    );
    if (!resultado) {
      throw new ErrorDeAplicacion('TRASLADO_SIN_EFECTO', 'La queja ya no está en asignada ni en_proceso');
    }
    const { correoId, ...respuesta } = resultado;
    await this.correo.despachar([correoId]);
    return respuesta;
  }

  rechazar(usuario: UsuarioAutenticado, id: number, motivo: string): Promise<ResultadoTrasladoDto> {
    const recortado = motivo.trim();
    if (recortado === '' || [...recortado].length > MOTIVO_TRASLADO_MAX) {
      throw new ErrorDeAplicacion(
        'MOTIVO_REQUERIDO',
        `El motivo del rechazo es obligatorio, hasta ${MOTIVO_TRASLADO_MAX} caracteres`,
      );
    }
    return conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async (repos) => {
        const { traslados } = repos;
        const solicitud = await this.pendiente(traslados, id);
        const ahora = this.clock.now();
        await traslados.resolver(id, {
          estado: 'rechazada',
          resueltoPor: usuario.id,
          motivoResolucion: recortado,
          resueltoEn: ahora,
        });
        // La queja no cambia: solo se avisa a quien lo pidió, sin el motivo (SPEC 36).
        await this.notificarResuelto(repos, solicitud.ticketId, usuario.id, [solicitud.solicitadoPor], id, 'rechazada', ahora);
        return { solicitud: aDto((await traslados.obtener(id))!) };
      }),
    );
  }

  // Solo quien la solicitó: para cualquier otro usuario la solicitud no existe.
  retirar(usuario: UsuarioAutenticado, id: number): Promise<ResultadoTrasladoDto> {
    return conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ traslados }) => {
        const solicitud = await traslados.obtenerParaActualizar(id);
        if (!solicitud || solicitud.solicitadoPor !== usuario.id) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la solicitud ${id}`);
        }
        exigirPendiente(solicitud.estado);
        await traslados.resolver(id, {
          estado: 'retirada',
          resueltoPor: usuario.id,
          motivoResolucion: null,
          resueltoEn: this.clock.now(),
        });
        return { solicitud: aDto((await traslados.obtener(id))!) };
      }),
    );
  }

  async listar(estado: EstadoSolicitud, pagina: number, tamano: number): Promise<Pagina<SolicitudTrasladoDto>> {
    const resultado = await this.transaccion.ejecutar(({ traslados }) => traslados.listar(estado, pagina, tamano));
    return { ...resultado, datos: resultado.datos.map(aDto) };
  }

  dependencias(): Promise<DependenciaActiva[]> {
    return this.catalogo.listarDependenciasActivas();
  }

  // Sin el motivo ni las dependencias: el motivo del traslado es interno (SPEC 28). Se encola en la transacción y se
  // despacha después del commit (SPEC 34).
  private encolarTrasladada(
    { ticket, titulo, solicitante }: TicketParaTransicion,
    correos: CorreoSalienteRepository,
  ): Promise<number | null> {
    if (!solicitante.email) {
      return Promise.resolve(null);
    }
    return this.correo.encolar(
      'queja_trasladada',
      { nombre: solicitante.nombre, numero: ticket.numero, titulo, enlace: `${this.appUrl}/consulta?numero=${ticket.numero}` },
      { para: solicitante.email, usuarioId: solicitante.id, ticketId: ticket.id },
      correos,
    );
  }

  private notificarResuelto(
    repos: ReposTransaccionales,
    ticketId: number,
    autorId: number,
    usuarios: (number | null)[],
    solicitudId: number,
    resultado: ResultadoTraslado,
    ahora: Date,
  ): Promise<number> {
    return this.notificaciones.notificar(
      repos,
      { tipo: 'traslado_resuelto', ticketId, autorId, candidatos: { usuarios }, datos: { solicitudId, resultado } },
      ahora,
    );
  }

  private async pendiente(traslados: ReposTransaccionales['traslados'], id: number) {
    const solicitud = await traslados.obtenerParaActualizar(id);
    if (!solicitud) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la solicitud ${id}`);
    }
    exigirPendiente(solicitud.estado);
    return solicitud;
  }
}
