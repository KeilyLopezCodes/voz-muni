import { alComentar, ventanaValida } from '../../domain/notificaciones/aviso-comentarios';
import type { AvisosComentariosRepository } from '../../domain/repositories/avisos-comentarios-repository';
import type { CorreoSalienteRepository } from '../../domain/repositories/correo-saliente-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { NotificadorCorreo } from './notificador-correo.service';

export const TAMANO_LOTE_AVISOS = 100;
export const CLAVE_VENTANA_AVISOS = 'aviso_comentarios_ventana_minutos';

const MINUTO_MS = 60_000;

// La queja que recibe un comentario público, ya bloqueada con FOR UPDATE por el caso de uso.
export interface QuejaComentada {
  id: number;
  numero: string;
  titulo: string;
  solicitante: { id: number; nombre: string; email: string | null };
}

// Avisos al vecino de los comentarios públicos de su queja (RF-31, SPEC 35). El primero de cada ventana se encola al
// instante desde la transacción del comentario; los demás se juntan y el job de correos encola el agrupado cuando
// la ventana se cierra. Ningún correo copia el texto de los comentarios.
export class AvisosComentariosService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly parametros: ParametroRepository,
    private readonly correo: Pick<NotificadorCorreo, 'encolar' | 'despachar'>,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly log: (mensaje: string) => void,
  ) {}

  // Un comentario público de alguien que no es el solicitante, dentro de su transacción. Devuelve el id del correo
  // encolado, o null si se acumuló o el solicitante no tiene correo.
  async alComentar(
    repos: { avisosComentarios: AvisosComentariosRepository; correosSalientes: CorreoSalienteRepository },
    queja: QuejaComentada,
    ahora: Date,
  ): Promise<number | null> {
    const estado = await repos.avisosComentarios.obtenerEstado(queja.id);
    const decision = alComentar(estado, ahora, await this.ventanaMinutos());
    await repos.avisosComentarios.guardarEstado(queja.id, decision.nuevoEstado);
    if (decision.tipo !== 'enviar_ahora' || !queja.solicitante.email) {
      return null;
    }
    return this.correo.encolar(
      'comentario_publico',
      this.variables(queja),
      { para: queja.solicitante.email, usuarioId: queja.solicitante.id, ticketId: queja.id },
      repos.correosSalientes,
    );
  }

  // Primer paso del job de correos: por lotes, encola el agrupado de cada queja con la ventana cerrada, reinicia su
  // estado (abre una ventana nueva) y despacha después de cada commit. Devuelve cuántos encoló.
  async procesar(ahora: Date): Promise<number> {
    const cerradaHasta = new Date(ahora.getTime() - (await this.ventanaMinutos()) * MINUTO_MS);
    let encolados = 0;
    for (;;) {
      const { reclamadas, correos } = await this.transaccion.ejecutar(async ({ avisosComentarios, correosSalientes }) => {
        const quejas = await avisosComentarios.reclamarVencidos(cerradaHasta, TAMANO_LOTE_AVISOS);
        const correos: (number | null)[] = [];
        for (const queja of quejas) {
          await avisosComentarios.guardarEstado(queja.ticketId, { avisoComentarioEn: ahora, pendientes: 0 });
          if (queja.solicitante.email) {
            correos.push(
              await this.correo.encolar(
                'comentarios_publicos_agrupados',
                { ...this.variables({ ...queja, id: queja.ticketId }), cantidad: String(queja.pendientes) },
                { para: queja.solicitante.email, usuarioId: queja.solicitante.id, ticketId: queja.ticketId },
                correosSalientes,
              ),
            );
          }
        }
        return { reclamadas: quejas.length, correos };
      });
      await this.correo.despachar(correos);
      encolados += correos.filter((id) => id !== null).length;
      if (reclamadas < TAMANO_LOTE_AVISOS) {
        return encolados;
      }
    }
  }

  // Un parámetro inválido nunca hace fallar el comentario: se avisa al instante, sin agrupar (ventana 0).
  private async ventanaMinutos(): Promise<number> {
    const valor = await this.parametros.obtener(CLAVE_VENTANA_AVISOS);
    const ventana = ventanaValida(valor);
    if (ventana === null) {
      this.log(`${CLAVE_VENTANA_AVISOS} falta o no es un entero de 1 a 1440; los comentarios se avisan sin agrupar`);
      return 0;
    }
    return ventana;
  }

  private variables({ numero, titulo, solicitante }: QuejaComentada): Record<string, string> {
    return { nombre: solicitante.nombre, numero, titulo, enlace: `${this.appUrl}/consulta?numero=${numero}` };
  }
}
