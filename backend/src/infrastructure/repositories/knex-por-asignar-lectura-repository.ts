import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import { ESTADOS_ABIERTOS } from '../../domain/repositories/asignacion-repository';
import type {
  PorAsignarLecturaRepository,
  TicketPorAsignar,
  VistaPorAsignar,
} from '../../domain/repositories/por-asignar-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Prioridad } from '../../domain/ticket/prioridad';
import type { SlaLectura } from '../../domain/sla/sla-lectura';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';
import { COLUMNA_SLA } from './knex-sla';

// pg devuelve los bigint como string.
interface FilaPorAsignar {
  id: string;
  numero: string;
  estado: TicketPorAsignar['estado'];
  prioridad: Prioridad;
  titulo: string;
  categoria_id: string;
  categoria_nombre: string;
  dependencia_id: string;
  dependencia_nombre: string;
  zona_id: string;
  zona_nombre: string;
  zona_tipo: string;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  creado_en: Date;
  sla: SlaLectura;
}

const COLUMNAS = [
  't.id',
  't.numero',
  't.estado',
  't.prioridad',
  't.titulo',
  't.categoria_id',
  'c.nombre as categoria_nombre',
  't.dependencia_id',
  'd.nombre as dependencia_nombre',
  't.zona_id',
  'z.nombre as zona_nombre',
  'z.tipo as zona_tipo',
  'tec.id as tecnico_id',
  'tec.nombre as tecnico_nombre',
  't.creado_en',
];

// Urgente primero; una prioridad nula (no debería existir después del triage) queda al final.
const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baja' THEN 3 ELSE 4 END`;

function aTicketPorAsignar(fila: FilaPorAsignar): TicketPorAsignar {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    prioridad: fila.prioridad,
    titulo: fila.titulo,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    dependencia: { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre },
    zona: { id: Number(fila.zona_id), nombre: fila.zona_nombre, tipo: fila.zona_tipo },
    tecnico: fila.tecnico_id === null ? null : { id: Number(fila.tecnico_id), nombre: fila.tecnico_nombre ?? '' },
    creadoEn: fila.creado_en,
    sla: fila.sla,
  };
}

export class KnexPorAsignarLecturaRepository implements PorAsignarLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(
    filtro: FiltroTickets,
    vista: VistaPorAsignar,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketPorAsignar>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const base = this.db('tickets as t');
    if (vista === 'sin_tecnico') {
      base.where('t.estado', 'asignada').whereNull('t.asignado_a');
    } else {
      base.whereIn('t.estado', ESTADOS_ABIERTOS as unknown as string[]);
    }
    const consulta = aplicarFiltro(base, filtro, COLUMNAS_TICKET, 't');
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaPorAsignar[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('dependencias as d', 'd.id', 't.dependencia_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .leftJoin('usuarios as tec', 'tec.id', 't.asignado_a')
      .select([...COLUMNAS, this.db.raw(COLUMNA_SLA)])
      .orderByRaw(`${ORDEN_PRIORIDAD}, t.creado_en ASC, t.id ASC`)
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aTicketPorAsignar), pagina, tamano, total: Number(total) };
  }
}
