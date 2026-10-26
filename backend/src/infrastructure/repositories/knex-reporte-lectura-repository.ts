import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type {
  CriteriosResumen,
  IndicadoresLeidos,
  ReporteLecturaRepository,
  ResumenLeido,
} from '../../domain/repositories/reporte-lectura-repository';
import { ESTADOS_TICKET, type EstadoTicket } from '../../domain/ticket/estado-ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

function enCero(): Record<EstadoTicket, number> {
  return Object.fromEntries(ESTADOS_TICKET.map((estado) => [estado, 0])) as Record<EstadoTicket, number>;
}

// La tabla de domain/reportes/cumplimiento.ts en SQL (SPEC 43); `?` es `ahora`. Las dos deben decir lo mismo: lo
// comprueba tests/db/reportes.api.test.ts.
const CUMPLIMIENTO_RESPUESTA = `CASE
  WHEN t.vence_respuesta IS NULL THEN 'no_aplica'
  WHEN t.primera_respuesta_en IS NOT NULL THEN
    CASE WHEN t.primera_respuesta_en <= t.vence_respuesta THEN 'cumple' ELSE 'incumple' END
  WHEN ? > t.vence_respuesta THEN 'incumple'
  ELSE 'pendiente'
END`;
const CUMPLIMIENTO_RESOLUCION = `CASE
  WHEN t.estado = 'rechazada' OR (t.vence_resolucion IS NULL AND t.sla_pausado_desde IS NULL) THEN 'no_aplica'
  WHEN t.sla_pausado_desde IS NOT NULL THEN
    CASE WHEN COALESCE(t.sla_restante_minutos, 0) > 0 THEN 'pendiente' ELSE 'incumple' END
  WHEN t.estado IN ('resuelta', 'cerrada') AND t.resuelto_en IS NOT NULL THEN
    CASE WHEN t.resuelto_en <= t.vence_resolucion THEN 'cumple' ELSE 'incumple' END
  WHEN ? > t.vence_resolucion THEN 'incumple'
  ELSE 'pendiente'
END`;

// Una sola pasada por las quejas del rango, agrupada por las 4 dimensiones del tablero (pocas combinaciones): la
// agregación es paralela y no ordena en disco. El total y los grupos por dependencia, categoría, zona y estado se
// combinan en memoria. Con GROUPING SETS el p95 con 500 000 quejas pasaba de 1 s (SPEC 43).
const AGREGADOS = `
  count(*) AS cantidad,
  sum(x.minutos_respuesta) AS suma_respuesta,
  count(x.minutos_respuesta) AS con_respuesta,
  sum(x.minutos_resolucion) AS suma_resolucion,
  count(x.minutos_resolucion) AS con_resolucion,
  count(*) FILTER (WHERE x.respuesta = 'cumple') AS respuesta_cumple,
  count(*) FILTER (WHERE x.respuesta = 'incumple') AS respuesta_incumple,
  count(*) FILTER (WHERE x.respuesta = 'pendiente') AS respuesta_pendiente,
  count(*) FILTER (WHERE x.resolucion = 'cumple') AS resolucion_cumple,
  count(*) FILTER (WHERE x.resolucion = 'incumple') AS resolucion_incumple,
  count(*) FILTER (WHERE x.resolucion = 'pendiente') AS resolucion_pendiente,
  count(*) FILTER (WHERE x.escalado AND x.estado NOT IN ('rechazada', 'cerrada')) AS escaladas_abiertas`;

interface FilaCelda {
  dependencia_id: string | null;
  categoria_id: string;
  zona_id: string;
  estado: EstadoTicket;
  cantidad: string;
  suma_respuesta: string | null;
  con_respuesta: string;
  suma_resolucion: string | null;
  con_resolucion: string;
  respuesta_cumple: string;
  respuesta_incumple: string;
  respuesta_pendiente: string;
  resolucion_cumple: string;
  resolucion_incumple: string;
  resolucion_pendiente: string;
  escaladas_abiertas: string;
}

// Sumas de un grupo; los promedios salen al final de suma / cantidad con dato.
interface Acumulado {
  cantidad: number;
  sumaRespuesta: number;
  conRespuesta: number;
  sumaResolucion: number;
  conResolucion: number;
  respuesta: { cumple: number; incumple: number; pendiente: number };
  resolucion: { cumple: number; incumple: number; pendiente: number };
  escaladasAbiertas: number;
}

const vacio = (): Acumulado => ({
  cantidad: 0,
  sumaRespuesta: 0,
  conRespuesta: 0,
  sumaResolucion: 0,
  conResolucion: 0,
  respuesta: { cumple: 0, incumple: 0, pendiente: 0 },
  resolucion: { cumple: 0, incumple: 0, pendiente: 0 },
  escaladasAbiertas: 0,
});

function sumar(a: Acumulado, f: FilaCelda): void {
  a.cantidad += Number(f.cantidad);
  a.sumaRespuesta += Number(f.suma_respuesta ?? 0);
  a.conRespuesta += Number(f.con_respuesta);
  a.sumaResolucion += Number(f.suma_resolucion ?? 0);
  a.conResolucion += Number(f.con_resolucion);
  a.respuesta.cumple += Number(f.respuesta_cumple);
  a.respuesta.incumple += Number(f.respuesta_incumple);
  a.respuesta.pendiente += Number(f.respuesta_pendiente);
  a.resolucion.cumple += Number(f.resolucion_cumple);
  a.resolucion.incumple += Number(f.resolucion_incumple);
  a.resolucion.pendiente += Number(f.resolucion_pendiente);
  a.escaladasAbiertas += Number(f.escaladas_abiertas);
}

function aIndicadores(a: Acumulado): IndicadoresLeidos {
  return {
    cantidad: a.cantidad,
    minutosPromedioRespuesta: a.conRespuesta === 0 ? null : a.sumaRespuesta / a.conRespuesta,
    minutosPromedioResolucion: a.conResolucion === 0 ? null : a.sumaResolucion / a.conResolucion,
    cumplimientoRespuesta: { ...a.respuesta },
    cumplimientoResolucion: { ...a.resolucion },
    escaladasAbiertas: a.escaladasAbiertas,
  };
}

// Acumula las celdas por una clave (la dependencia, la categoría o la zona).
function agruparPor(celdas: FilaCelda[], clave: (f: FilaCelda) => string | null): Map<string | null, Acumulado> {
  const grupos = new Map<string | null, Acumulado>();
  for (const celda of celdas) {
    const k = clave(celda);
    const grupo = grupos.get(k) ?? vacio();
    sumar(grupo, celda);
    grupos.set(k, grupo);
  }
  return grupos;
}

const sinNulos = (grupos: Map<string | null, Acumulado>) => [...grupos.keys()].filter((k): k is string => k !== null);

export class KnexReporteLecturaRepository implements ReporteLecturaRepository {
  constructor(private readonly db: Knex) {}

  async contarPorEstado(filtro: FiltroTickets): Promise<Record<EstadoTicket, number>> {
    const conteo = enCero();
    if (filtro === null) {
      return conteo;
    }
    const filas: { estado: EstadoTicket; total: string }[] = await aplicarFiltro(
      this.db('tickets as t'),
      filtro,
      COLUMNAS_TICKET,
      't',
    )
      .select('t.estado')
      .count({ total: '*' })
      .groupBy('t.estado');
    for (const { estado, total } of filas) {
      conteo[estado] = Number(total);
    }
    return conteo;
  }

  async resumen(filtro: FiltroTickets, criterios: CriteriosResumen): Promise<ResumenLeido> {
    if (filtro === null) {
      return {
        porEstado: enCero(),
        porCategoria: [],
        porDependencia: [],
        porZona: [],
        indicadores: aIndicadores(vacio()),
        indicadoresPorDependencia: [],
        indicadoresPorCategoria: [],
      };
    }
    return this.db.transaction(async (trx) => {
      // Todas las consultas ven la misma foto de la base.
      await trx.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

      // Las quejas del rango, dentro del alcance y con los filtros opcionales, que solo reducen.
      const quejas = aplicarFiltro(trx('tickets as t'), filtro, COLUMNAS_TICKET, 't')
        .where('t.creado_en', '>=', criterios.inicio)
        .where('t.creado_en', '<', criterios.fin);
      if (criterios.dependenciaId !== null) quejas.where('t.dependencia_id', criterios.dependenciaId);
      if (criterios.categoriaId !== null) quejas.where('t.categoria_id', criterios.categoriaId);
      if (criterios.zonaId !== null) quejas.where('t.zona_id', criterios.zonaId);
      if (criterios.prioridad !== null) quejas.where('t.prioridad', criterios.prioridad);

      const clasificadas = quejas.select(
        't.estado',
        't.escalado',
        't.minutos_respuesta',
        't.minutos_resolucion',
        't.dependencia_id',
        't.categoria_id',
        't.zona_id',
        trx.raw(`${CUMPLIMIENTO_RESPUESTA} AS respuesta`, [criterios.ahora]),
        trx.raw(`${CUMPLIMIENTO_RESOLUCION} AS resolucion`, [criterios.ahora]),
      );
      const celdas: FilaCelda[] = await trx
        .from(clasificadas.as('x'))
        .select('x.dependencia_id', 'x.categoria_id', 'x.zona_id', 'x.estado', trx.raw(AGREGADOS))
        .groupBy('x.dependencia_id', 'x.categoria_id', 'x.zona_id', 'x.estado');

      const porDependencia = agruparPor(celdas, (c) => c.dependencia_id);
      const porCategoria = agruparPor(celdas, (c) => c.categoria_id);
      const porZona = agruparPor(celdas, (c) => c.zona_id);
      const dependencias: { id: string; nombre: string }[] = await trx('dependencias')
        .whereIn('id', sinNulos(porDependencia))
        .select('id', 'nombre');
      const categorias: { id: string; nombre: string }[] = await trx('categorias')
        .whereIn('id', sinNulos(porCategoria))
        .select('id', 'nombre');
      const zonas: { id: string; nombre: string; tipo: string }[] = await trx('zonas')
        .whereIn('id', sinNulos(porZona))
        .select('id', 'nombre', 'tipo');
      const nombre = (filas: { id: string; nombre: string }[], id: string) => filas.find((f) => f.id === id)!.nombre;

      const porEstado = enCero();
      const total = vacio();
      for (const celda of celdas) {
        porEstado[celda.estado] += Number(celda.cantidad);
        sumar(total, celda);
      }
      return {
        porEstado,
        porCategoria: [...porCategoria].map(([id, g]) => ({ id: Number(id), nombre: nombre(categorias, id!), cantidad: g.cantidad })),
        // null = sin dependencia (en revisión).
        porDependencia: [...porDependencia].map(([id, g]) => ({
          id: id === null ? null : Number(id),
          nombre: id === null ? null : nombre(dependencias, id),
          cantidad: g.cantidad,
        })),
        porZona: [...porZona].map(([id, g]) => {
          const zona = zonas.find((z) => z.id === id)!;
          return { id: Number(id), nombre: zona.nombre, tipo: zona.tipo, cantidad: g.cantidad };
        }),
        indicadores: aIndicadores(total),
        // Las quejas sin dependencia no tienen indicadores de dependencia.
        indicadoresPorDependencia: [...porDependencia]
          .filter(([id]) => id !== null)
          .map(([id, g]) => ({ id: Number(id), nombre: nombre(dependencias, id!), ...aIndicadores(g) })),
        indicadoresPorCategoria: [...porCategoria].map(([id, g]) => ({
          id: Number(id),
          nombre: nombre(categorias, id!),
          ...aIndicadores(g),
        })),
      };
    });
  }
}
