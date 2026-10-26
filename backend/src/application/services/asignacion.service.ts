import { validarAsignacion } from '../../domain/asignacion/asignacion-tecnico';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Clock } from '../../domain/health/clock';
import type { TecnicoConCarga } from '../../domain/repositories/asignacion-repository';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type {
  PorAsignarLecturaRepository,
  VistaPorAsignar,
} from '../../domain/repositories/por-asignar-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { AsignacionHechaDto, DatosAsignacion, TicketPorAsignarDto } from '../dto/asignacion.dto';
import { aSlaDto } from '../dto/sla.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';

// Asignación y reasignación de técnico (RF-14, SPEC 20). El coordinador actúa en su dependencia y el supervisor
// en todas, según el alcance de tickets.asignar (SPEC 11). La primera asignación (también la primera después de un
// traslado) avisa al vecino con tecnico_asignado; una reasignación no (SPEC 35).
export class AsignacionService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly bandeja: PorAsignarLecturaRepository,
    private readonly clock: Clock,
    private readonly correo: NotificadorCorreo,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  async asignar(usuario: UsuarioAutenticado, id: number, datos: DatosAsignacion): Promise<AsignacionHechaDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.asignar');
    const { hecha, correoId } = await conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ ticketsEscritura, asignaciones, correosSalientes }) => {
        // FOR UPDATE: dos asignaciones simultáneas se aplican una después de la otra.
        const actual = await ticketsEscritura.obtenerParaActualizar(id, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
        }
        const candidato = await asignaciones.obtenerCandidato(datos.tecnicoId);
        if (!candidato) {
          throw new ErrorDeAplicacion('TECNICO_NO_ELEGIBLE', `No existe el usuario ${datos.tecnicoId}`);
        }
        const tecnicoAnterior = actual.ticket.asignadoA;
        const { motivo } = validarAsignacion({
          ticketDependenciaId: actual.ticket.dependenciaId,
          tecnicoActual: tecnicoAnterior,
          candidato,
          motivo: datos.motivo,
        });
        // SPEC 04: solo en asignada o en_proceso (OPERACION_NO_PERMITIDA); el estado no cambia.
        const ticket = actual.ticket.asignarTecnico(candidato.id);
        await ticketsEscritura.guardarTecnico(ticket);
        await asignaciones.registrar({
          ticketId: ticket.id,
          tecnicoAnterior,
          tecnicoNuevo: candidato.id,
          asignadoPor: usuario.id,
          motivo,
          creadoEn: this.clock.now(),
        });
        // Sin el nombre del técnico, como en el detalle del vecino (SPEC 25).
        const correoId =
          tecnicoAnterior === null && ticket.dependenciaId !== null
            ? await this.encolarAsignado(actual, await asignaciones.nombreDependencia(ticket.dependenciaId), correosSalientes)
            : null;
        const hecha = { id: ticket.id, numero: ticket.numero, estado: ticket.estado, asignadoA: candidato.id, tecnicoAnterior };
        return { hecha, correoId };
      }),
    );
    await this.correo.despachar([correoId]);
    return hecha;
  }

  private encolarAsignado(
    { ticket, titulo, solicitante }: TicketParaTransicion,
    dependencia: string | null,
    correos: CorreoSalienteRepository,
  ): Promise<number | null> {
    if (!solicitante.email || dependencia === null) {
      return Promise.resolve(null);
    }
    return this.correo.encolar(
      'tecnico_asignado',
      {
        nombre: solicitante.nombre,
        numero: ticket.numero,
        titulo,
        dependencia,
        enlace: `${this.appUrl}/consulta?numero=${ticket.numero}`,
      },
      { para: solicitante.email, usuarioId: solicitante.id, ticketId: ticket.id },
      correos,
    );
  }

  async listarPorAsignar(
    usuario: UsuarioAutenticado,
    vista: VistaPorAsignar,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketPorAsignarDto>> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.asignar');
    const resultado = await this.bandeja.listar(filtro, vista, pagina, tamano);
    return {
      ...resultado,
      datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString(), sla: aSlaDto(t.sla, t.estado) })),
    };
  }

  // El coordinador solo ve su dependencia: otra responde lo mismo que una inexistente.
  async tecnicos(usuario: UsuarioAutenticado, dependenciaId: number): Promise<TecnicoConCarga[]> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.asignar');
    const fueraDeAlcance =
      filtro === null || filtro.some((c) => c.campo === 'dependenciaId' && c.valor !== dependenciaId);
    if (fueraDeAlcance) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe la dependencia ${dependenciaId}`);
    }
    return this.transaccion.ejecutar(({ asignaciones }) => asignaciones.tecnicosConCarga(dependenciaId));
  }
}
