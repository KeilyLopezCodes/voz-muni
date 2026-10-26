import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import {
  debeReanudar,
  esEditable,
  exigirComentable,
  exigirEditable,
  validarCuerpo,
} from '../../domain/comentarios/comentario';
import type { Clock } from '../../domain/health/clock';
import type { ComentarioLeido } from '../../domain/repositories/comentario-repository';
import type { TicketLecturaRepository } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { ComentarioCreadoDto, ComentarioDto, DatosComentario } from '../dto/comentarios.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { SlaService } from './sla.service';

// Comentarios públicos y notas internas (RF-19, RF-22, SPEC 23). El permiso para escribir (comentarios.publico o
// comentarios.interno, según `interno`) lo valida la presentación; aquí el acceso al ticket sale de tickets.ver.
export class ComentariosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly tickets: TicketLecturaRepository,
    private readonly clock: Clock,
    private readonly sla: Pick<SlaService, 'alReanudar'>,
  ) {}

  comentar(usuario: UsuarioAutenticado, ticketId: number, datos: DatosComentario): Promise<ComentarioCreadoDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.ver');
    return conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ ticketsEscritura, comentarios }) => {
        // FOR UPDATE: si el comentario reanuda la queja, no compite con otra transición.
        const actual = await ticketsEscritura.obtenerParaActualizar(ticketId, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
        }
        exigirComentable(actual.ticket.estado, datos.interno);
        const cuerpo = validarCuerpo(datos.cuerpo);
        const ahora = this.clock.now();
        const id = await comentarios.crear({
          ticketId,
          autorId: usuario.id,
          cuerpo,
          interno: datos.interno,
          creadoEn: ahora,
        });

        // RF-22: la respuesta del vecino devuelve la queja a en_proceso, a su nombre y sin motivo.
        let estado = actual.ticket.estado;
        const reanuda = debeReanudar({
          estadoTicket: actual.ticket.estado,
          autorId: usuario.id,
          solicitanteId: actual.solicitante.id,
          interno: datos.interno,
        });
        if (reanuda) {
          const resultado = actual.ticket.reanudar({ actorId: usuario.id, ahora });
          // Mismo cálculo que reanudar en la atención (SPEC 30): la pausa se cierra en un solo lugar.
          const cambiosSla = await this.sla.alReanudar(
            { ...actual.sla, categoriaId: actual.categoria.id, prioridad: actual.ticket.prioridad! },
            ahora,
          );
          await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id, cambiosSla);
          estado = resultado.ticket.estado;
        }
        return {
          comentario: this.aDto((await comentarios.obtener(id))!, usuario, ahora),
          ticket: { id: ticketId, estado },
        };
      }),
    );
  }

  async listar(usuario: UsuarioAutenticado, ticketId: number): Promise<{ datos: ComentarioDto[] }> {
    const ticket = await this.tickets.obtener(ticketId, filtroTicketsParaAccion(usuario, 'tickets.ver'));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
    }
    // Sin comentarios.interno las notas internas ni siquiera se leen de la base.
    const incluirInternos = usuario.permisos['comentarios.interno'] !== undefined;
    const ahora = this.clock.now();
    const leidos = await this.transaccion.ejecutar(({ comentarios }) => comentarios.listar(ticketId, incluirInternos));
    return { datos: leidos.map((c) => this.aDto(c, usuario, ahora)) };
  }

  // Solo el autor, durante 5 minutos. No cambia `interno`, no reanuda la queja y no guarda el texto anterior.
  editar(usuario: UsuarioAutenticado, ticketId: number, comentarioId: number, cuerpo: string): Promise<ComentarioDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.ver');
    return conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ ticketsEscritura, comentarios }) => {
        const actual = await ticketsEscritura.obtenerParaActualizar(ticketId, filtro);
        const comentario = actual ? await comentarios.obtenerDelAutor(ticketId, comentarioId, usuario.id) : null;
        if (!actual || !comentario) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el comentario ${comentarioId}`);
        }
        const ahora = this.clock.now();
        exigirEditable(comentario.creadoEn, ahora);
        exigirComentable(actual.ticket.estado, comentario.interno);
        await comentarios.editar(comentarioId, validarCuerpo(cuerpo), ahora);
        return this.aDto((await comentarios.obtener(comentarioId))!, usuario, ahora);
      }),
    );
  }

  private aDto(comentario: ComentarioLeido, usuario: UsuarioAutenticado, ahora: Date): ComentarioDto {
    return {
      ...comentario,
      creadoEn: comentario.creadoEn.toISOString(),
      editadoEn: comentario.editadoEn ? comentario.editadoEn.toISOString() : null,
      editable: comentario.autor.id === usuario.id && esEditable(comentario.creadoEn, ahora),
    };
  }
}
