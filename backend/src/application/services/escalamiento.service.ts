import type { Transaccion } from '../../domain/repositories/transaccion';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

export const TAMANO_LOTE_ESCALAMIENTO = 200;

// Escalamiento al vencer el SLA (RF-29, SPEC 32). Marca la queja con el dominio (Ticket.marcarEscalado) y avisa a
// quienes atienden los escalamientos, todo en una transacción por lote. Lo llama el job de SLA después de las
// alertas (SPEC 31). Sigue el mismo patrón: reclamo con SKIP LOCKED y lotes.
export class EscalamientoService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly log: (mensaje: string) => void,
  ) {}

  // Procesa por lotes hasta que no queden pendientes. Devuelve cuántas quejas escaló.
  async procesar(ahora: Date): Promise<number> {
    let escaladas = 0;
    for (;;) {
      const lote = await conReglasDeNegocio(() =>
        this.transaccion.ejecutar(async ({ escalamiento, ticketsEscritura, notificaciones, destinatarios }) => {
          const pendientes = await escalamiento.reclamarPendientes(ahora, TAMANO_LOTE_ESCALAMIENTO);
          if (pendientes.length === 0) {
            return 0;
          }
          const supervisores = await destinatarios.supervisores();
          for (const pendiente of pendientes) {
            // El job no actúa en nombre de un usuario: sin filtro de alcance. La fila ya está bloqueada.
            const actual = await ticketsEscritura.obtenerParaActualizar(pendiente.ticketId, []);
            if (!actual) {
              continue;
            }
            await ticketsEscritura.guardarEscalado(actual.ticket.marcarEscalado(ahora, pendiente.plazo));
            if (supervisores.length === 0) {
              // Se escala igual: la marca registra que el plazo venció.
              this.log(`Escalamiento del ticket ${pendiente.ticketId} sin supervisores activos`);
            }
            await notificaciones.crear(
              supervisores.map((usuarioId) => ({
                usuarioId,
                ticketId: pendiente.ticketId,
                tipo: 'sla_escalamiento' as const,
                datos: { plazo: pendiente.plazo, vence: pendiente.vence.toISOString() },
                creadoEn: ahora,
              })),
            );
          }
          return pendientes.length;
        }),
      );
      escaladas += lote;
      if (lote < TAMANO_LOTE_ESCALAMIENTO) {
        return escaladas;
      }
    }
  }
}
