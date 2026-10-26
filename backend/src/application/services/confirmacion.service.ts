import { exigeMotivoAlConfirmar } from '../../domain/atencion/acciones-confirmacion';
import type { Alcance } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../domain/errors/invalid-transition-error';
import type { Clock } from '../../domain/health/clock';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { ResultadoTransicion } from '../../domain/ticket/ticket';
import { puedeTransicionar } from '../../domain/ticket/transiciones';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { ComandoConfirmacion, ConfirmacionHechaDto } from '../dto/confirmacion.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import { eventoTicket } from './auditoria-tickets';
import type { NotificadorCorreo } from './notificador-correo.service';
import type { NotificacionesInternasService } from './notificaciones-internas.service';
import type { PlazosConfirmacionService } from './plazos-confirmacion.service';
import type { SlaService } from './sla.service';

interface ConfirmacionHecha {
  actual: TicketParaTransicion;
  resultado: ResultadoTransicion;
}

const DESTINO = { confirmar: 'cerrada', reabrir: 'en_proceso' } as const;

// Confirmar o reabrir la solución (RF-24, SPEC 27). El permiso (alcance de tickets.cambiar_estado aceptado por
// puedeConfirmar) lo valida la presentación; el filtro de alcance limita qué tickets se pueden tocar.
export class ConfirmacionService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly plazos: Pick<PlazosConfirmacionService, 'maxReaperturas'>,
    private readonly correo: NotificadorCorreo,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly sla: Pick<SlaService, 'alReabrir'>,
    private readonly notificaciones: Pick<NotificacionesInternasService, 'notificar'>, // SPEC 36
  ) {}

  async transicionar(
    usuario: UsuarioAutenticado,
    alcance: Alcance,
    id: number,
    comando: ComandoConfirmacion,
  ): Promise<ConfirmacionHechaDto> {
    // Un interno que confirma en nombre del vecino explica por qué (el historial lo conserva).
    if (comando.accion === 'confirmar' && exigeMotivoAlConfirmar(alcance) && !comando.motivo?.trim()) {
      throw new ErrorDeAplicacion('MOTIVO_REQUERIDO', 'Confirmar en nombre del vecino exige un motivo');
    }
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.cambiar_estado');
    const hecha = await conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ ticketsEscritura, correosSalientes, destinatarios, notificaciones, auditoria }) => {
        // FOR UPDATE, como en SPEC 19 y 22: una segunda acción simultánea ve el estado nuevo y recibe 409.
        const actual = await ticketsEscritura.obtenerParaActualizar(id, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
        }
        const { ticket } = actual;
        // Primero el estado de origen, como en el dominio: una queja que no está resuelta responde 409
        // TRANSICION_INVALIDA aunque no tenga plazo.
        if (!puedeTransicionar(ticket.estado, DESTINO[comando.accion])) {
          throw new InvalidTransitionError(ticket.estado, DESTINO[comando.accion]);
        }
        if (ticket.confirmacionVenceEn === null) {
          throw new ErrorDeAplicacion('PLAZO_NO_DEFINIDO', `La queja ${id} no tiene plazo de confirmación`);
        }
        const ctx = { actorId: usuario.id, ahora: this.clock.now() };
        const resultado =
          comando.accion === 'confirmar'
            ? ticket.confirmarSolucion(ctx, ticket.confirmacionVenceEn, comando.motivo)
            : ticket.reabrir(ctx, comando.motivo, ticket.confirmacionVenceEn, await this.plazos.maxReaperturas());
        // La reapertura reinicia la resolución con la política vigente (SPEC 30). Una queja resuelta siempre tiene
        // prioridad: la fijó aceptar.
        const cambiosSla =
          comando.accion === 'reabrir'
            ? await this.sla.alReabrir(
                { ...actual.sla, categoriaId: actual.categoria.id, prioridad: ticket.prioridad! },
                ctx.ahora,
              )
            : {};
        await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id, cambiosSla);
        await auditoria.registrar(
          eventoTicket(`ticket.${comando.accion}`, ticket, resultado.ticket, usuario.id, { motivo: comando.motivo ?? null }),
        );
        // La solución no convenció: el técnico asignado y los coordinadores de la dependencia (SPEC 36).
        if (comando.accion === 'reabrir') {
          await this.notificaciones.notificar(
            { destinatarios, notificaciones },
            {
              tipo: 'queja_reabierta',
              ticketId: ticket.id,
              autorId: usuario.id,
              candidatos: { usuarios: [resultado.ticket.asignadoA], coordinadoresDe: resultado.ticket.dependenciaId },
              datos: {},
            },
            ctx.ahora,
          );
        }
        // El aviso se encola en la misma transacción (SPEC 34): si se revierte, no queda correo.
        const hecha: ConfirmacionHecha = { actual, resultado };
        return { ...hecha, correoId: await this.encolarAviso(comando, hecha, correosSalientes) };
      }),
    );

    await this.correo.despachar([hecha.correoId]);
    const { ticket } = hecha.resultado;
    return {
      id: ticket.id,
      numero: ticket.numero,
      estado: ticket.estado,
      asignadoA: ticket.asignadoA,
      resueltoEn: ticket.resueltoEn ? ticket.resueltoEn.toISOString() : null,
      cerradoEn: ticket.cerradoEn ? ticket.cerradoEn.toISOString() : null,
      reaperturas: ticket.reaperturas,
    };
  }

  // Se despacha después del commit y sin esperar: la transición no depende del correo.
  private async encolarAviso(
    comando: ComandoConfirmacion,
    { actual, resultado }: ConfirmacionHecha,
    correos: CorreoSalienteRepository,
  ): Promise<number | null> {
    const { solicitante } = actual;
    if (!solicitante.email) {
      return null;
    }
    const comunes = {
      nombre: solicitante.nombre,
      numero: resultado.ticket.numero,
      titulo: actual.titulo,
      enlace: `${this.appUrl}/consulta?numero=${resultado.ticket.numero}`,
    };
    // Al reabrir va el motivo recortado que quedó en el historial.
    const [clave, variables] =
      comando.accion === 'confirmar'
        ? ['queja_cerrada', comunes]
        : ['queja_reabierta', { ...comunes, motivo: resultado.historial.motivo ?? '' }];
    return this.correo.encolar(
      clave,
      variables,
      { para: solicitante.email, usuarioId: solicitante.id, ticketId: resultado.ticket.id },
      correos,
    );
  }
}
