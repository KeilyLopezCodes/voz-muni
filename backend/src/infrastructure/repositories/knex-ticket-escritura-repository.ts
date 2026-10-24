import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type {
  CategoriaDestino,
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../domain/repositories/ticket-escritura-repository';
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
      }),
      titulo: fila.titulo,
      categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
      solicitante: { id: Number(fila.solicitante_id), nombre: fila.solicitante_nombre, email: fila.solicitante_email },
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

  async guardarTransicion({ ticket, historial }: ResultadoTransicion, categoriaId: number): Promise<void> {
    await this.db('tickets').where({ id: ticket.id }).update({
      estado: ticket.estado,
      prioridad: ticket.prioridad,
      dependencia_id: ticket.dependenciaId,
      asignado_a: ticket.asignadoA,
      escalado: ticket.escalado,
      resuelto_en: ticket.resueltoEn,
      cerrado_en: ticket.cerradoEn,
      categoria_id: categoriaId,
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
