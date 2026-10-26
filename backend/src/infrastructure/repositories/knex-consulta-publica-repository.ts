import type { Knex } from 'knex';
import type {
  CambioDeEstadoPublico,
  ComentarioPublico,
  ConsultaPublicaRepository,
  QuejaPublica,
} from '../../domain/repositories/consulta-publica-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';

// pg devuelve los bigint como string.
interface FilaQueja {
  id: string;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  categoria: string;
  zona: string;
  creado_en: Date;
  resuelto_en: Date | null;
  cerrado_en: Date | null;
  cierre_automatico: boolean;
  resolucion: string | null;
  confirmacion_vence_en: Date | null;
  solicitante_id: string;
  solicitante_email: string | null;
  solicitante_telefono: string | null;
}

// Cerrada por el job de SLA (SPEC 33): la última transición a cerrada no tiene usuario, como en el detalle.
const CIERRE_AUTOMATICO = `COALESCE(t.estado = 'cerrada' AND (
   SELECT h.usuario_id IS NULL FROM ticket_historial h
   WHERE h.ticket_id = t.id AND h.estado_nuevo = 'cerrada'
   ORDER BY h.creado_en DESC, h.id DESC LIMIT 1
 ), false) as cierre_automatico`;

// Solo lectura (SPEC 37). No selecciona dirección, coordenadas, datos extra, dependencia, prioridad ni técnico.
export class KnexConsultaPublicaRepository implements ConsultaPublicaRepository {
  constructor(private readonly db: Knex) {}

  async obtenerPorNumero(numero: string): Promise<QuejaPublica | null> {
    const fila: FilaQueja | undefined = await this.db('tickets as t')
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .join('usuarios as u', 'u.id', 't.solicitante_id')
      .where('t.numero', numero)
      .first(
        't.id',
        't.numero',
        't.titulo',
        't.estado',
        'c.nombre as categoria',
        'z.nombre as zona',
        't.creado_en',
        't.resuelto_en',
        't.cerrado_en',
        this.db.raw(CIERRE_AUTOMATICO),
        't.resolucion',
        't.confirmacion_vence_en',
        't.solicitante_id',
        'u.email as solicitante_email',
        'u.telefono as solicitante_telefono',
      );
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      numero: fila.numero,
      titulo: fila.titulo,
      estado: fila.estado,
      categoria: fila.categoria,
      zona: fila.zona,
      creadoEn: fila.creado_en,
      resueltoEn: fila.resuelto_en,
      cerradoEn: fila.cerrado_en,
      cierreAutomatico: fila.cierre_automatico,
      resolucion: fila.resolucion,
      confirmacionVenceEn: fila.confirmacion_vence_en,
      solicitante: { id: Number(fila.solicitante_id), email: fila.solicitante_email, telefono: fila.solicitante_telefono },
    };
  }

  async cambiosDeEstado(ticketId: number, limite: number): Promise<CambioDeEstadoPublico[]> {
    const filas: {
      creado_en: Date;
      usuario_id: string | null;
      estado_anterior: EstadoTicket | null;
      estado_nuevo: EstadoTicket;
      motivo: string | null;
    }[] = await this.db('ticket_historial')
      .where({ ticket_id: ticketId })
      .orderBy([
        { column: 'creado_en', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(limite)
      .select('creado_en', 'usuario_id', 'estado_anterior', 'estado_nuevo', 'motivo');
    return filas.map((fila) => ({
      ocurridoEn: fila.creado_en,
      usuarioId: fila.usuario_id === null ? null : Number(fila.usuario_id),
      estadoAnterior: fila.estado_anterior,
      estadoNuevo: fila.estado_nuevo,
      motivo: fila.motivo,
    }));
  }

  async comentariosPublicos(ticketId: number, limite: number): Promise<ComentarioPublico[]> {
    // Las notas internas se filtran en la consulta, nunca después (SPEC 23).
    const filas: { cuerpo: string; autor_id: string; creado_en: Date; editado_en: Date | null }[] = await this.db(
      'comentarios',
    )
      .where({ ticket_id: ticketId, es_interno: false })
      .orderBy([
        { column: 'creado_en', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(limite)
      .select('cuerpo', 'autor_id', 'creado_en', 'editado_en');
    return filas
      .reverse()
      .map((fila) => ({ cuerpo: fila.cuerpo, autorId: Number(fila.autor_id), creadoEn: fila.creado_en, editadoEn: fila.editado_en }));
  }
}
