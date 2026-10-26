import type { CierreAutomaticoRepository } from '../../domain/repositories/cierre-automatico-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';
import { eventoTicket } from './auditoria-tickets';
import type { NotificadorCorreo } from './notificador-correo.service';

export const TAMANO_LOTE_CIERRE = 200;

// Cierre automático de las quejas resueltas sin respuesta del vecino (RF-30, SPEC 33), el tercer paso del job de SLA.
// Cierra con el dominio (Ticket.cerrarPorVencimiento, actor sistema) y avisa al solicitante después de confirmar
// cada lote. Nunca inventa un plazo: las resueltas sin confirmacion_vence_en solo se informan en el log.
export class CierreAutomaticoService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly lectura: Pick<CierreAutomaticoRepository, 'contarSinPlazo'>,
    private readonly correo: NotificadorCorreo,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly log: (mensaje: string) => void,
  ) {}

  // Procesa por lotes hasta que no queden vencidas. Devuelve cuántas cerró.
  async procesar(ahora: Date): Promise<number> {
    let cerradas = 0;
    for (;;) {
      const { reclamadas, cerradasLote, correos } = await conReglasDeNegocio(() =>
        this.transaccion.ejecutar(async ({ cierreAutomatico, ticketsEscritura, correosSalientes, auditoria }) => {
          const ids = await cierreAutomatico.reclamarVencidas(ahora, TAMANO_LOTE_CIERRE);
          let cerradasLote = 0;
          const correos: (number | null)[] = [];
          for (const id of ids) {
            // El job no actúa en nombre de un usuario: sin filtro de alcance. La fila ya está bloqueada.
            const actual = await ticketsEscritura.obtenerParaActualizar(id, []);
            if (!actual || actual.ticket.estado !== 'resuelta' || actual.ticket.confirmacionVenceEn === null) {
              continue;
            }
            const resultado = actual.ticket.cerrarPorVencimiento(
              { actorId: null, ahora },
              actual.ticket.confirmacionVenceEn,
            );
            await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
            await auditoria.registrar(
              eventoTicket('ticket.cerrar_automatico', actual.ticket, resultado.ticket, null, {
                confirmacionVenceEn: actual.ticket.confirmacionVenceEn,
              }),
            );
            cerradasLote++;
            // El aviso se encola en la transacción del lote (SPEC 34).
            const { solicitante } = actual;
            if (solicitante.email) {
              correos.push(
                await this.correo.encolar(
                  'queja_cerrada_automaticamente',
                  { nombre: solicitante.nombre, numero: actual.ticket.numero, titulo: actual.titulo, enlace: `${this.appUrl}/tickets/${id}` },
                  { para: solicitante.email, usuarioId: solicitante.id, ticketId: id },
                  correosSalientes,
                ),
              );
            }
          }
          return { reclamadas: ids.length, cerradasLote, correos };
        }),
      );
      // Después del commit: un fallo del correo no revierte el cierre.
      await this.correo.despachar(correos);
      cerradas += cerradasLote;
      if (reclamadas < TAMANO_LOTE_CIERRE) {
        break;
      }
    }
    const sinPlazo = await this.lectura.contarSinPlazo();
    if (sinPlazo > 0) {
      this.log(`Cierre automático: ${sinPlazo} quejas resueltas sin plazo de confirmación no se cierran`);
    }
    return cerradas;
  }
}
