import { exigeMotivoAlConfirmar } from '../../domain/atencion/acciones-confirmacion';
import type { Alcance } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../domain/errors/invalid-transition-error';
import type { Clock } from '../../domain/health/clock';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { ResultadoTransicion } from '../../domain/ticket/ticket';
import { puedeTransicionar } from '../../domain/ticket/transiciones';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { ComandoConfirmacion, ConfirmacionHechaDto } from '../dto/confirmacion.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';
import type { PlazosConfirmacionService } from './plazos-confirmacion.service';

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
    private readonly correo: EnvioCorreo,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
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
      this.transaccion.ejecutar(async ({ ticketsEscritura }): Promise<ConfirmacionHecha> => {
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
        await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
        return { actual, resultado };
      }),
    );

    this.avisarSolicitante(comando, hecha);
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

  // Después del commit y sin esperar: la transición no depende del correo.
  private avisarSolicitante(comando: ComandoConfirmacion, { actual, resultado }: ConfirmacionHecha): void {
    const { solicitante } = actual;
    if (!solicitante.email) {
      return;
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
    this.correo.sinEsperar(clave, solicitante.email, variables, solicitante.id);
  }
}
