import type { CierreAutomaticoRepository } from '../../domain/repositories/cierre-automatico-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';

export const TAMANO_LOTE_CIERRE = 200;

interface AvisoCierre {
  ticketId: number;
  numero: string;
  titulo: string;
  solicitante: { id: number; nombre: string; email: string | null };
}

// Cierre automático de las quejas resueltas sin respuesta del vecino (RF-30, SPEC 33), el tercer paso del job de SLA.
// Cierra con el dominio (Ticket.cerrarPorVencimiento, actor sistema) y avisa al solicitante después de confirmar
// cada lote. Nunca inventa un plazo: las resueltas sin confirmacion_vence_en solo se informan en el log.
export class CierreAutomaticoService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly lectura: Pick<CierreAutomaticoRepository, 'contarSinPlazo'>,
    private readonly correo: EnvioCorreo,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly log: (mensaje: string) => void,
  ) {}

  // Procesa por lotes hasta que no queden vencidas. Devuelve cuántas cerró.
  async procesar(ahora: Date): Promise<number> {
    let cerradas = 0;
    for (;;) {
      const { reclamadas, avisos } = await conReglasDeNegocio(() =>
        this.transaccion.ejecutar(async ({ cierreAutomatico, ticketsEscritura }) => {
          const ids = await cierreAutomatico.reclamarVencidas(ahora, TAMANO_LOTE_CIERRE);
          const avisos: AvisoCierre[] = [];
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
            avisos.push({ ticketId: id, numero: actual.ticket.numero, titulo: actual.titulo, solicitante: actual.solicitante });
          }
          return { reclamadas: ids.length, avisos };
        }),
      );
      // Después del commit: un fallo del correo no revierte el cierre.
      for (const aviso of avisos) {
        this.avisar(aviso);
      }
      cerradas += avisos.length;
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

  // El enlace lleva al detalle de la queja (SPEC 33), como queja_resuelta.
  private avisar({ ticketId, numero, titulo, solicitante }: AvisoCierre): void {
    if (!solicitante.email) {
      return;
    }
    this.correo.sinEsperar(
      'queja_cerrada_automaticamente',
      solicitante.email,
      { nombre: solicitante.nombre, numero, titulo, enlace: `${this.appUrl}/tickets/${ticketId}` },
      solicitante.id,
    );
  }
}
