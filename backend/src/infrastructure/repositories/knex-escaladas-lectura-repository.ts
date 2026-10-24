import type { Knex } from 'knex';
import type { EscaladasLecturaRepository, TicketEscalado } from '../../domain/repositories/escaladas-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { SlaLectura } from '../../domain/sla/sla-lectura';
import type { TipoPlazo } from '../../domain/sla/vencimientos';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { COLUMNA_SLA } from './knex-sla';

interface FilaEscalada {
  id: string;
  numero: string;
  titulo: string;
  estado: TicketEscalado['estado'];
  prioridad: Prioridad | null;
  categoria_id: string;
  categoria_nombre: string;
  dependencia_id: string | null;
  dependencia_nombre: string | null;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  escalado_en: Date;
  escalado_por: TipoPlazo;
  sla: SlaLectura;
}

export class KnexEscaladasLecturaRepository implements EscaladasLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(dependenciaId: number | null, pagina: number, tamano: number): Promise<Pagina<TicketEscalado>> {
    const consulta = this.db('tickets as t')
      .where('t.escalado', true)
      .whereIn('t.estado', ['asignada', 'en_proceso', 'en_espera', 'en_revision']);
    if (dependenciaId !== null) {
      consulta.where('t.dependencia_id', dependenciaId);
    }
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaEscalada[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .leftJoin('dependencias as d', 'd.id', 't.dependencia_id')
      .leftJoin('usuarios as tec', 'tec.id', 't.asignado_a')
      .select(
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
        this.db.raw(COLUMNA_SLA),
      )
      .orderBy([
        { column: 't.escalado_en', order: 'asc' },
        { column: 't.id', order: 'asc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return {
      datos: filas.map((fila) => ({
        id: Number(fila.id),
        numero: fila.numero,
        titulo: fila.titulo,
        estado: fila.estado,
        prioridad: fila.prioridad,
        categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
        dependencia:
          fila.dependencia_id === null ? null : { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre ?? '' },
        tecnico: fila.tecnico_id === null ? null : { id: Number(fila.tecnico_id), nombre: fila.tecnico_nombre ?? '' },
        escaladoEn: fila.escalado_en.toISOString(),
        escaladoPor: fila.escalado_por,
        sla: fila.sla,
      })),
      pagina,
      tamano,
      total: Number(total),
    };
  }
}
