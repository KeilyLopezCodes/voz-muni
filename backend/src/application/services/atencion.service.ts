import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { Clock } from '../../domain/health/clock';
import type { AtencionLecturaRepository, EstadoAtencion } from '../../domain/repositories/atencion-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { ResultadoTransicion, Ticket } from '../../domain/ticket/ticket';
import type { ContextoTransicion } from '../../domain/ticket/contexto-transicion';
import type { AtencionHechaDto, ComandoAtencion, TicketAtencionDto } from '../dto/atencion.dto';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';

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
// los traduce el manejador de errores. Estas acciones no envían correos.
export class AtencionService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly bandeja: AtencionLecturaRepository,
    private readonly clock: Clock,
    private readonly vencimientoConfirmacion: CalcularVencimientoConfirmacion,
  ) {}

  transicionar(usuario: UsuarioAutenticado, id: number, comando: ComandoAtencion): Promise<AtencionHechaDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.cambiar_estado');
    return this.transaccion.ejecutar(async ({ ticketsEscritura }) => {
      // FOR UPDATE, como en SPEC 19: una segunda transición simultánea ve el estado nuevo y recibe 409.
      const actual = await ticketsEscritura.obtenerParaActualizar(id, filtro);
      if (!actual) {
        throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
      }
      const ahora = this.clock.now();
      // Solo resolver necesita el plazo de confirmación (SPEC 27). Si no se puede calcular, la queja no cambia.
      const confirmacionVenceEn = comando.accion === 'resolver' ? await this.vencimientoConfirmacion(ahora) : null;
      const resultado = aplicar(actual.ticket, { actorId: usuario.id, ahora }, comando, confirmacionVenceEn);
      await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
      const { ticket } = resultado;
      return {
        id: ticket.id,
        numero: ticket.numero,
        estado: ticket.estado,
        asignadoA: ticket.asignadoA,
        resueltoEn: ticket.resueltoEn ? ticket.resueltoEn.toISOString() : null,
      };
    });
  }

  async listar(
    usuario: UsuarioAutenticado,
    estados: readonly EstadoAtencion[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketAtencionDto>> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.cambiar_estado');
    const resultado = await this.bandeja.listar(filtro, estados, pagina, tamano);
    return { ...resultado, datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString() })) };
  }
}
