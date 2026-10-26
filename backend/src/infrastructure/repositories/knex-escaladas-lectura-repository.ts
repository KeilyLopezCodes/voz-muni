import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import {
  type EscaladasLecturaRepository,
  ESTADOS_ESCALADAS,
  type EstadoEscalada,
  type TicketEscalado,
} from '../../domain/repositories/escaladas-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Prioridad } from '../../domain/ticket/prioridad';
import type { TipoPlazo } from '../../domain/ticket/ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';
import { COLUMNAS_SLA_LECTURA, type FilaSlaLectura, slaDeFila } from './knex-sla';

// pg devuelve los bigint como string.
interface FilaEscalada extends FilaSlaLectura {
  id: string;
  numero: string;
  titulo: string;
  estado: EstadoEscalada;
  prioridad: Prioridad;
  categoria_id: string;
  categoria_nombre: string;
  dependencia_id: string | null;
  dependencia_nombre: string | null;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  escalado_en: Date;
  escalado_por: TipoPlazo;
}

// Del solicitante, nada: la bandeja no lo necesita (RNF-12).
const COLUMNAS = [
  't.id',
  't.numero',
  't.titulo',
  't.estado',
  't.prioridad',
  't.categoria_id',
  'c.nombre as categoria_nombre',
  't.dependencia_id',
  'd.nombre as dependencia_nombre',
  'tec.id as tecnico_id',
  'tec.nombre as tecnico_nombre',
  't.escalado_en',
  't.escalado_por',
  ...COLUMNAS_SLA_LECTURA,
];

function aTicketEscalado(fila: FilaEscalada): TicketEscalado {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    titulo: fila.titulo,
    estado: fila.estado,
    prioridad: fila.prioridad,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    dependencia:
      fila.dependencia_id === null ? null : { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre ?? '' },
    tecnico: fila.tecnico_id === null ? null : { id: Number(fila.tecnico_id), nombre: fila.tecnico_nombre ?? '' },
    escaladoEn: fila.escalado_en,
    escaladoPor: fila.escalado_por,
    sla: slaDeFila(fila),
  };
}

export class KnexEscaladasLecturaRepository implements EscaladasLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(
    filtro: FiltroTickets,
    dependenciaId: number | null,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketEscalado>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const base = this.db('tickets as t')
      .where('t.escalado', true)
      .whereIn('t.estado', ESTADOS_ESCALADAS as unknown as string[]);
    if (dependenciaId !== null) {
      base.where('t.dependencia_id', dependenciaId);
    }
    const consulta = aplicarFiltro(base, filtro, COLUMNAS_TICKET, 't');
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaEscalada[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .leftJoin('dependencias as d', 'd.id', 't.dependencia_id')
      .leftJoin('usuarios as tec', 'tec.id', 't.asignado_a')
      .select(COLUMNAS)
      .orderBy([{ column: 't.escalado_en' }, { column: 't.id' }])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aTicketEscalado), pagina, tamano, total: Number(total) };
  }
}
