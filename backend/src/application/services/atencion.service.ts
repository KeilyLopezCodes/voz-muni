import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Clock } from '../../domain/health/clock';
import type { AtencionLecturaRepository, EstadoAtencion } from '../../domain/repositories/atencion-lectura-repository';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { CambiosSla } from '../../domain/sla/vencimientos';
import type { ResultadoTransicion, Ticket } from '../../domain/ticket/ticket';
import type { ContextoTransicion } from '../../domain/ticket/contexto-transicion';
import type { AtencionHechaDto, ComandoAtencion, TicketAtencionDto } from '../dto/atencion.dto';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { aSlaDto } from '../dto/sla.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { eventoTicket } from './auditoria-tickets';
import type { NotificadorCorreo } from './notificador-correo.service';
import { fechaHoraParaCorreo } from './formato-fecha';
import type { SlaService, TicketConPolitica } from './sla.service';

// Fin del plazo para confirmar o reabrir una queja resuelta en `ahora` (SPEC 27). Lanza CALENDARIO_INCOMPLETO o
// PARAMETRO_INVALIDO si no se puede calcular: nunca se inventa un plazo.
export type CalcularVencimientoConfirmacion = (ahora: Date) => Promise<Date>;

// Cada acción de atención es un método de dominio de SPEC 04.
function aplicar(
  ticket: Ticket,
  ctx: ContextoTransicion,
  comando: ComandoAtencion,
  confirmacionVenceEn: Date | null,
): ResultadoTransicion {
  switch (comando.accion) {
    case 'iniciar':
      return ticket.iniciar(ctx);
    case 'poner_en_espera':
      return ticket.ponerEnEspera(ctx, comando.motivo);
    case 'reanudar':
      return ticket.reanudar(ctx);
    case 'resolver':
      return ticket.resolver(ctx, comando.descripcion, confirmacionVenceEn!);
  }
}

// Atención interna de la queja (RF-18, RF-21, RF-23, SPEC 22). El permiso (alcance de tickets.cambiar_estado)
// lo valida la presentación antes de llegar aquí; el filtro de alcance limita qué tickets se pueden tocar.
// Los errores del dominio (TECNICO_REQUERIDO, MOTIVO_REQUERIDO, DESCRIPCION_REQUERIDA, InvalidTransitionError)
// los traduce el manejador de errores. Resolver envía queja_resuelta, con el plazo para confirmar (SPEC 33), y poner
// en espera envía informacion_solicitada, con lo que se le pide al vecino (SPEC 35).
export class AtencionService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly bandeja: AtencionLecturaRepository,
    private readonly clock: Clock,
    private readonly vencimientoConfirmacion: CalcularVencimientoConfirmacion,
    private readonly sla: Pick<SlaService, 'alIniciar' | 'alPonerEnEspera' | 'alReanudar'>,
    private readonly correo: NotificadorCorreo,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  async transicionar(usuario: UsuarioAutenticado, id: number, comando: ComandoAtencion): Promise<AtencionHechaDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.cambiar_estado');
    const { ticket, correoId } = await this.transaccion.ejecutar(async ({ ticketsEscritura, correosSalientes, auditoria }) => {
      // FOR UPDATE, como en SPEC 19: una segunda transición simultánea ve el estado nuevo y recibe 409.
      const actual = await ticketsEscritura.obtenerParaActualizar(id, filtro);
      if (!actual) {
        throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
      }
      const ahora = this.clock.now();
      // Solo resolver necesita el plazo de confirmación (SPEC 27). Si no se puede calcular, la queja no cambia.
      const confirmacionVenceEn = comando.accion === 'resolver' ? await this.vencimientoConfirmacion(ahora) : null;
      const resultado = aplicar(actual.ticket, { actorId: usuario.id, ahora }, comando, confirmacionVenceEn);
      // Después del método de dominio (SPEC 30): si la transición no es válida, no se calcula nada.
      const cambiosSla = await this.cambiosSla(
        comando,
        { ...actual.sla, categoriaId: actual.categoria.id, prioridad: actual.ticket.prioridad! },
        ahora,
      );
      await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id, cambiosSla);
      await auditoria.registrar(
        eventoTicket(`ticket.${comando.accion}`, actual.ticket, resultado.ticket, usuario.id, {
          ...(comando.accion === 'poner_en_espera' ? { motivo: comando.motivo } : {}),
          ...(comando.accion === 'resolver' ? { descripcion: comando.descripcion } : {}),
        }),
      );
      // El aviso se encola en la misma transacción (SPEC 34): si se revierte, no queda correo.
      const correoId = await this.encolarAviso(comando, actual, resultado.ticket, correosSalientes);
      return { ticket: resultado.ticket, correoId };
    });

    await this.correo.despachar([correoId]);
    return {
      id: ticket.id,
      numero: ticket.numero,
      estado: ticket.estado,
      asignadoA: ticket.asignadoA,
      resueltoEn: ticket.resueltoEn ? ticket.resueltoEn.toISOString() : null,
    };
  }

  // Se despacha después del commit y sin esperar: la respuesta no depende del correo.
  private async encolarAviso(
    comando: ComandoAtencion,
    actual: TicketParaTransicion,
    ticket: Ticket,
    correos: CorreoSalienteRepository,
  ): Promise<number | null> {
    if (comando.accion === 'resolver') {
      return this.encolarResuelta(actual, ticket, correos);
    }
    if (comando.accion !== 'poner_en_espera' || !actual.solicitante.email) {
      return null;
    }
    // La información pedida es pública para el vecino (SPEC 28); renderizar la escapa en el html.
    return this.correo.encolar(
      'informacion_solicitada',
      {
        nombre: actual.solicitante.nombre,
        numero: ticket.numero,
        titulo: actual.titulo,
        informacion: comando.motivo.trim(),
        enlace: `${this.appUrl}/consulta?numero=${ticket.numero}`,
      },
      { para: actual.solicitante.email, usuarioId: actual.solicitante.id, ticketId: ticket.id },
      correos,
    );
  }

  // El enlace lleva al detalle, porque confirmar y reabrir requieren sesión (SPEC 33).
  private async encolarResuelta(
    { solicitante, titulo }: TicketParaTransicion,
    ticket: Ticket,
    correos: CorreoSalienteRepository,
  ): Promise<number | null> {
    if (!solicitante.email || !ticket.confirmacionVenceEn) {
      return null;
    }
    return this.correo.encolar(
      'queja_resuelta',
      {
        nombre: solicitante.nombre,
        numero: ticket.numero,
        titulo,
        solucion: ticket.resolucion ?? '',
        fecha_limite: fechaHoraParaCorreo(ticket.confirmacionVenceEn),
        enlace: `${this.appUrl}/tickets/${ticket.id}`,
      },
      { para: solicitante.email, usuarioId: solicitante.id, ticketId: ticket.id },
      correos,
    );
  }

  // Resolver no mueve los vencimientos.
  private async cambiosSla(comando: ComandoAtencion, sla: TicketConPolitica, ahora: Date): Promise<CambiosSla> {
    switch (comando.accion) {
      case 'iniciar':
        return this.sla.alIniciar(sla, ahora);
      case 'poner_en_espera':
        return this.sla.alPonerEnEspera(sla, ahora);
      case 'reanudar':
        return this.sla.alReanudar(sla, ahora);
      case 'resolver':
        return {};
    }
  }

  async listar(
    usuario: UsuarioAutenticado,
    estados: readonly EstadoAtencion[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketAtencionDto>> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.cambiar_estado');
    const resultado = await this.bandeja.listar(filtro, estados, pagina, tamano);
    return {
      ...resultado,
      datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString(), sla: aSlaDto(t.sla, t.estado) })),
    };
  }
}
