import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type {
  CategoriaDestino,
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../domain/repositories/ticket-escritura-repository';
import type { CambiosSla, TipoPlazo } from '../../domain/sla/vencimientos';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { Ticket, type ResultadoTransicion } from '../../domain/ticket/ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

// pg devuelve los bigint como string.
interface FilaTicket {
  id: string;
  numero: string;
  estado: EstadoTicket;
  dependencia_id: string | null;
  asignado_a: string | null;
  prioridad: Prioridad | null;
  escalado: boolean;
  resuelto_en: Date | null;
  cerrado_en: Date | null;
  resolucion: string | null;
  resuelto_por: string | null;
  confirmacion_vence_en: Date | null;
  reaperturas: number;
  escalado_en: Date | null;
  escalado_por: TipoPlazo | null;
  creado_en: Date;
  zona_id: string;
  vence_respuesta: Date | null;
  vence_resolucion: Date | null;
  primera_respuesta_en: Date | null;
  sla_inicio_resolucion: Date | null;
  sla_pausa_minutos: number;
  sla_pausado_desde: Date | null;
  sla_restante_minutos: number | null;
  alerta_respuesta_en: Date | null;
  alerta_resolucion_en: Date | null;
  alerta_respuesta_enviada_en: Date | null;
  alerta_resolucion_enviada_en: Date | null;
  aviso_comentario_en: Date | null;
  dependencia_nombre: string | null;
  titulo: string;
  categoria_id: string;
  categoria_nombre: string;
  solicitante_id: string;
  solicitante_nombre: string;
  solicitante_email: string | null;
}

interface FilaCategoria {
  id: string;
  nombre: string;
  activa: boolean;
  dependencia_id: string;
  dependencia_nombre: string;
}

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

export class KnexTicketEscrituraRepository implements TicketEscrituraRepository {
  constructor(private readonly db: Knex) {}

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    if (filtro === null) {
      return null;
    }
    // FOR UPDATE OF t: solo se bloquea la fila del ticket, no la categoría ni el solicitante.
    const fila: FilaTicket | undefined = await aplicarFiltro(
      this.db('tickets as t')
        .join('categorias as c', 'c.id', 't.categoria_id')
        .join('usuarios as u', 'u.id', 't.solicitante_id')
        .leftJoin('dependencias as dep', 'dep.id', 't.dependencia_id')
        .where('t.id', id),
      filtro,
      COLUMNAS_TICKET,
      't',
    )
      .forUpdate('t')
      .first(
        't.id',
        't.numero',
        't.estado',
        't.dependencia_id',
        't.asignado_a',
        't.prioridad',
        't.escalado',
        't.resuelto_en',
        't.cerrado_en',
        't.resolucion',
        't.resuelto_por',
        't.confirmacion_vence_en',
        't.reaperturas',
        't.escalado_en',
        't.escalado_por',
        't.creado_en',
        't.zona_id',
        't.vence_respuesta',
        't.vence_resolucion',
        't.primera_respuesta_en',
        't.sla_inicio_resolucion',
        't.sla_pausa_minutos',
        't.sla_pausado_desde',
        't.sla_restante_minutos',
        't.alerta_respuesta_en',
        't.alerta_resolucion_en',
        't.alerta_respuesta_enviada_en',
        't.alerta_resolucion_enviada_en',
        't.aviso_comentario_en',
        'dep.nombre as dependencia_nombre',
        't.titulo',
        't.categoria_id',
        'c.nombre as categoria_nombre',
        't.solicitante_id',
        'u.nombre as solicitante_nombre',
        'u.email as solicitante_email',
      );
    if (!fila) {
      return null;
    }
    return {
      ticket: Ticket.reconstituir({
        id: Number(fila.id),
        numero: fila.numero,
        estado: fila.estado,
        dependenciaId: numeroONull(fila.dependencia_id),
        asignadoA: numeroONull(fila.asignado_a),
        prioridad: fila.prioridad,
        escalado: fila.escalado,
        resueltoEn: fila.resuelto_en,
        cerradoEn: fila.cerrado_en,
        resolucion: fila.resolucion,
        resueltoPor: numeroONull(fila.resuelto_por),
        confirmacionVenceEn: fila.confirmacion_vence_en,
        reaperturas: fila.reaperturas,
        escaladoEn: fila.escalado_en,
        escaladoPor: fila.escalado_por,
      }),
      titulo: fila.titulo,
      categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
      solicitante: { id: Number(fila.solicitante_id), nombre: fila.solicitante_nombre, email: fila.solicitante_email },
      zonaId: Number(fila.zona_id),
      dependenciaNombre: fila.dependencia_nombre,
      avisoComentarioEn: fila.aviso_comentario_en,
      sla: {
        creadoEn: fila.creado_en,
        venceRespuesta: fila.vence_respuesta,
        venceResolucion: fila.vence_resolucion,
        primeraRespuestaEn: fila.primera_respuesta_en,
        inicioResolucion: fila.sla_inicio_resolucion,
        pausaMinutos: fila.sla_pausa_minutos,
        pausadoDesde: fila.sla_pausado_desde,
        restanteMinutos: fila.sla_restante_minutos,
        alertaRespuestaEn: fila.alerta_respuesta_en,
        alertaResolucionEn: fila.alerta_resolucion_en,
        alertaRespuestaEnviadaEn: fila.alerta_respuesta_enviada_en,
        alertaResolucionEnviadaEn: fila.alerta_resolucion_enviada_en,
      },
    };
  }

  async obtenerCategoria(categoriaId: number): Promise<CategoriaDestino | null> {
    const fila: FilaCategoria | undefined = await this.db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .where('c.id', categoriaId)
      .first(
        'c.id',
        'c.nombre',
        this.db.raw('(c.activa AND d.activa) as activa'),
        'c.dependencia_id',
        'd.nombre as dependencia_nombre',
      );
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      nombre: fila.nombre,
      activa: fila.activa,
      dependenciaId: Number(fila.dependencia_id),
      dependenciaNombre: fila.dependencia_nombre,
    };
  }

  async guardarTecnico(ticket: Ticket): Promise<void> {
    await this.db('tickets').where({ id: ticket.id }).update({ asignado_a: ticket.asignadoA });
  }

  async guardarEscalado(ticket: Ticket): Promise<void> {
    await this.db('tickets')
      .where({ id: ticket.id })
      .update({ escalado: ticket.escalado, escalado_en: ticket.escaladoEn, escalado_por: ticket.escaladoPor });
  }

  async marcarAvisoComentario(ticketId: number, ahora: Date): Promise<void> {
    await this.db('tickets').where({ id: ticketId }).update({ aviso_comentario_en: ahora });
  }

  async guardarTransicion(
    { ticket, historial }: ResultadoTransicion,
    categoriaId: number,
    sla: CambiosSla = {},
  ): Promise<void> {
    await this.db('tickets').where({ id: ticket.id }).update({
      estado: ticket.estado,
      prioridad: ticket.prioridad,
      dependencia_id: ticket.dependenciaId,
      asignado_a: ticket.asignadoA,
      escalado: ticket.escalado,
      escalado_en: ticket.escaladoEn,
      escalado_por: ticket.escaladoPor,
      resuelto_en: ticket.resueltoEn,
      cerrado_en: ticket.cerradoEn,
      // Resolución vigente (SPEC 26): sale del mismo resultado del dominio que el motivo del historial.
      resolucion: ticket.resolucion,
      resuelto_por: ticket.resueltoPor,
      // Plazo de confirmación y reaperturas (SPEC 27), del mismo resultado del dominio.
      confirmacion_vence_en: ticket.confirmacionVenceEn,
      reaperturas: ticket.reaperturas,
      categoria_id: categoriaId,
      ...columnasSla(sla),
    });
    await this.db('ticket_historial').insert({
      ticket_id: historial.ticketId,
      estado_anterior: historial.estadoAnterior,
      estado_nuevo: historial.estadoNuevo,
      usuario_id: historial.usuarioId,
      motivo: historial.motivo,
      creado_en: historial.creadoEn,
    });
  }
}

// Mapa fijo de CambiosSla → columna: solo se escriben los campos presentes (SPEC 30 y 31).
const COLUMNAS_SLA: Readonly<Record<keyof CambiosSla, string>> = {
  venceRespuesta: 'vence_respuesta',
  venceResolucion: 'vence_resolucion',
  primeraRespuestaEn: 'primera_respuesta_en',
  inicioResolucion: 'sla_inicio_resolucion',
  pausaMinutos: 'sla_pausa_minutos',
  pausadoDesde: 'sla_pausado_desde',
  restanteMinutos: 'sla_restante_minutos',
  alertaRespuestaEn: 'alerta_respuesta_en',
  alertaResolucionEn: 'alerta_resolucion_en',
  alertaRespuestaEnviadaEn: 'alerta_respuesta_enviada_en',
  alertaResolucionEnviadaEn: 'alerta_resolucion_enviada_en',
};

function columnasSla(sla: CambiosSla): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(sla) as (keyof CambiosSla)[]).map((campo) => [COLUMNAS_SLA[campo], sla[campo]]),
  );
}
