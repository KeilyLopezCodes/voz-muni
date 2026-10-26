import { filtroReportes } from '../../domain/autorizacion/alcance-reportes';
import { fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import type { Clock } from '../../domain/health/clock';
import { porcentaje } from '../../domain/reportes/cumplimiento';
import { rangoReportes } from '../../domain/reportes/rango-fechas';
import type { ConteoCumplimiento, IndicadoresLeidos, ReporteLecturaRepository } from '../../domain/repositories/reporte-lectura-repository';
import { ESTADOS_TICKET, type EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { Prioridad } from '../../domain/ticket/prioridad';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

export interface ConsultaResumen {
  desde?: string; // YYYY-MM-DD en America/Guatemala
  hasta?: string;
  dependenciaId?: number;
  categoriaId?: number;
  zonaId?: number;
  prioridad?: Prioridad;
}

export interface Indicadores {
  cantidad: number;
  horasPromedioRespuesta: number | null; // horas hábiles, 1 decimal; null sin datos
  horasPromedioResolucion: number | null;
  cumplimientoRespuesta: ConteoCumplimiento & { porcentaje: number | null };
  cumplimientoResolucion: ConteoCumplimiento & { porcentaje: number | null };
  escaladasAbiertas: number;
}

export interface ResumenReportes {
  rango: { desde: string; hasta: string };
  total: number;
  porEstado: { estado: EstadoTicket; cantidad: number }[];
  porCategoria: { id: number; nombre: string; cantidad: number }[];
  porDependencia: { id: number | null; nombre: string | null; cantidad: number }[];
  porZona: { id: number; nombre: string; tipo: string; cantidad: number }[];
  indicadores: Indicadores;
  indicadoresPorDependencia: ({ id: number; nombre: string } & Indicadores)[];
  indicadoresPorCategoria: ({ id: number; nombre: string } & Indicadores)[];
  generadoEn: string;
}

const horas = (minutos: number | null) => (minutos === null ? null : Math.round((minutos / 60) * 10) / 10);

const conPorcentaje = (c: ConteoCumplimiento) => ({ ...c, porcentaje: porcentaje(c.cumple, c.incumple) });

function aIndicadores(leidos: IndicadoresLeidos): Indicadores {
  return {
    cantidad: leidos.cantidad,
    horasPromedioRespuesta: horas(leidos.minutosPromedioRespuesta),
    horasPromedioResolucion: horas(leidos.minutosPromedioResolucion),
    cumplimientoRespuesta: conPorcentaje(leidos.cumplimientoRespuesta),
    cumplimientoResolucion: conPorcentaje(leidos.cumplimientoResolucion),
    escaladasAbiertas: leidos.escaladasAbiertas,
  };
}

// De mayor a menor cantidad y, con la misma, por nombre ("sin dependencia" al final).
function ordenar<T extends { cantidad: number; nombre: string | null }>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      b.cantidad - a.cantidad ||
      (a.nombre === null ? 1 : b.nombre === null ? -1 : a.nombre.localeCompare(b.nombre, 'es')),
  );
}

// Tablero de quejas e indicadores de SLA (RF-38, RF-39, SPEC 43), siempre dentro del alcance de reportes.ver
// (SPEC 11): el técnico sus asignadas, el coordinador su dependencia, el supervisor y el administrador todas. Las
// horas salen de los minutos hábiles que guarda SlaService; el rango es sobre la fecha de registro.
export class ReportesService {
  constructor(
    private readonly reportes: Pick<ReporteLecturaRepository, 'resumen'>,
    private readonly clock: Clock,
  ) {}

  async resumen(usuario: UsuarioAutenticado, consulta: ConsultaResumen): Promise<ResumenReportes> {
    const ahora = this.clock.now();
    const rango = await conReglasDeNegocio(async () => rangoReportes(consulta.desde, consulta.hasta, fechaLocal(ahora)));
    const leido = await this.reportes.resumen(filtroReportes(usuario), {
      inicio: rango.inicio,
      fin: rango.fin,
      dependenciaId: consulta.dependenciaId ?? null,
      categoriaId: consulta.categoriaId ?? null,
      zonaId: consulta.zonaId ?? null,
      prioridad: consulta.prioridad ?? null,
      ahora,
    });
    return {
      rango: { desde: rango.desde, hasta: rango.hasta },
      total: ESTADOS_TICKET.reduce((suma, estado) => suma + leido.porEstado[estado], 0),
      porEstado: ESTADOS_TICKET.map((estado) => ({ estado, cantidad: leido.porEstado[estado] })),
      porCategoria: ordenar(leido.porCategoria),
      porDependencia: ordenar(leido.porDependencia),
      porZona: ordenar(leido.porZona),
      indicadores: aIndicadores(leido.indicadores),
      indicadoresPorDependencia: ordenar(leido.indicadoresPorDependencia).map((g) => ({ id: g.id, nombre: g.nombre, ...aIndicadores(g) })),
      indicadoresPorCategoria: ordenar(leido.indicadoresPorCategoria).map((g) => ({ id: g.id, nombre: g.nombre, ...aIndicadores(g) })),
      generadoEn: ahora.toISOString(),
    };
  }
}
