import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import {
  type CriteriosGestion,
  ESTADOS_ABIERTOS_GESTION,
  type FiltroOpciones,
  type GestionLecturaRepository,
  type OpcionesGestion,
  type TicketGestion,
} from '../../domain/repositories/gestion-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';
import { COLUMNAS_SLA_LECTURA, type FilaSlaLectura, slaDeFila } from './knex-sla';
import { aplicarBusqueda } from './knex-ticket-lectura-repository';

// pg devuelve los bigint como string.
interface FilaGestion extends FilaSlaLectura {
  id: string;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  prioridad: Prioridad | null;
  categoria_id: string;
  categoria_nombre: string;
  dependencia_id: string | null;
  dependencia_nombre: string | null;
  zona_id: string;
  zona_nombre: string;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  creado_en: Date;
}

// Del solicitante, nada (RNF-12).
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
  't.zona_id',
  'z.nombre as zona_nombre',
  'tec.id as tecnico_id',
  'tec.nombre as tecnico_nombre',
  't.creado_en',
  ...COLUMNAS_SLA_LECTURA,
];

// Los valores son constantes del dominio, nunca entrada del usuario.
const ABIERTOS = ESTADOS_ABIERTOS_GESTION.map((estado) => `'${estado}'`).join(', ');
const GRUPO = `CASE WHEN t.estado IN (${ABIERTOS}) THEN (CASE WHEN t.escalado THEN 0 ELSE 1 END) ELSE 2 END`;
const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baja' THEN 3 ELSE 4 END`;
// Abiertas: prioridad y antigüedad; finalizadas (grupo 2): de la más reciente a la más antigua.
const ORDEN = [
  `${GRUPO}`,
  `CASE WHEN ${GRUPO} < 2 THEN ${ORDEN_PRIORIDAD} ELSE 0 END`,
  `CASE WHEN ${GRUPO} < 2 THEN t.creado_en END ASC`,
  `CASE WHEN ${GRUPO} < 2 THEN t.id END ASC`,
  `t.creado_en DESC`,
  `t.id DESC`,
].join(', ');

const ROL_TECNICO = 'tecnico';

function aTicketGestion(fila: FilaGestion): TicketGestion {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    titulo: fila.titulo,
    estado: fila.estado,
    prioridad: fila.prioridad,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    dependencia:
      fila.dependencia_id === null ? null : { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre ?? '' },
    zona: { id: Number(fila.zona_id), nombre: fila.zona_nombre },
    tecnico: fila.tecnico_id === null ? null : { id: Number(fila.tecnico_id), nombre: fila.tecnico_nombre ?? '' },
    creadoEn: fila.creado_en,
    sla: slaDeFila(fila),
  };
}

function aplicarCriterios(consulta: Knex.QueryBuilder, criterios: CriteriosGestion): Knex.QueryBuilder {
  aplicarBusqueda(consulta, criterios.busqueda);
  if (criterios.estados.length > 0) {
    consulta.whereIn('t.estado', [...criterios.estados]);
  }
  if (criterios.dependenciaId !== null) {
    consulta.where('t.dependencia_id', criterios.dependenciaId);
  }
  if (criterios.categoriaId !== null) {
    consulta.where('t.categoria_id', criterios.categoriaId);
  }
  if (criterios.prioridad !== null) {
    consulta.where('t.prioridad', criterios.prioridad);
  }
  if (criterios.inicio !== null) {
    consulta.where('t.creado_en', '>=', criterios.inicio);
  }
  if (criterios.fin !== null) {
    consulta.where('t.creado_en', '<', criterios.fin);
  }
  if (criterios.tecnico === 'sin_asignar') {
    consulta.whereNull('t.asignado_a');
  } else if (criterios.tecnico !== null) {
    consulta.where('t.asignado_a', criterios.tecnico);
  }
  return consulta;
}

export class KnexGestionLecturaRepository implements GestionLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(
    filtro: FiltroTickets,
    criterios: CriteriosGestion,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketGestion>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarCriterios(aplicarFiltro(this.db('tickets as t'), filtro, COLUMNAS_TICKET, 't'), criterios);
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaGestion[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .leftJoin('dependencias as d', 'd.id', 't.dependencia_id')
      .leftJoin('usuarios as tec', 'tec.id', 't.asignado_a')
      .select(COLUMNAS)
      .orderByRaw(ORDEN)
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aTicketGestion), pagina, tamano, total: Number(total) };
  }

  async opciones(filtro: FiltroOpciones): Promise<OpcionesGestion> {
    if (filtro === null) {
      return { dependencias: [], categorias: [], tecnicos: [] };
    }
    const deUna = filtro.dependencias === 'todas' ? null : filtro.dependencias;
    const dependencias = this.db('dependencias').select('id', 'nombre', 'activa').orderBy([{ column: 'nombre' }, { column: 'id' }]);
    const categorias = this.db('categorias')
      .select('id', 'nombre', 'dependencia_id', 'activa')
      .orderBy([{ column: 'nombre' }, { column: 'id' }]);
    if (deUna !== null) {
      dependencias.where('id', deUna);
      categorias.where('dependencia_id', deUna);
    }
    const tecnicos = filtro.tecnicos
      ? this.db('usuarios as u')
          .join('roles as r', 'r.id', 'u.rol_id')
          .where('r.nombre', ROL_TECNICO)
          .whereNotNull('u.dependencia_id')
          .modify((q) => {
            if (deUna !== null) {
              q.where('u.dependencia_id', deUna);
            }
          })
          .select('u.id', 'u.nombre', 'u.dependencia_id', 'u.activo')
          .orderBy([{ column: 'u.nombre' }, { column: 'u.id' }])
      : Promise.resolve([]);
    const [filasDep, filasCat, filasTec] = await Promise.all([dependencias, categorias, tecnicos]);
    return {
      dependencias: filasDep.map((f: { id: string; nombre: string; activa: boolean }) => ({
        id: Number(f.id),
        nombre: f.nombre,
        activa: f.activa,
      })),
      categorias: filasCat.map((f: { id: string; nombre: string; dependencia_id: string; activa: boolean }) => ({
        id: Number(f.id),
        nombre: f.nombre,
        dependenciaId: Number(f.dependencia_id),
        activa: f.activa,
      })),
      tecnicos: filasTec.map((f: { id: string; nombre: string; dependencia_id: string; activo: boolean }) => ({
        id: Number(f.id),
        nombre: f.nombre,
        dependenciaId: Number(f.dependencia_id),
        activo: f.activo,
      })),
    };
  }
}
