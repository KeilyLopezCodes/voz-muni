import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { EstadoTicket } from '../ticket/estado-ticket';
import type { Prioridad } from '../ticket/prioridad';

// Las quejas registradas en [inicio, fin), con los filtros opcionales del tablero (SPEC 43), que se intersectan
// con el alcance y nunca lo amplían. `ahora` decide qué abiertas ya vencieron.
export interface CriteriosResumen {
  inicio: Date;
  fin: Date;
  dependenciaId: number | null;
  categoriaId: number | null;
  zonaId: number | null;
  prioridad: Prioridad | null;
  ahora: Date;
}

export interface ConteoCumplimiento {
  cumple: number;
  incumple: number;
  pendiente: number;
}

// Agregados de un grupo de quejas. Los promedios en minutos hábiles, null sin datos.
export interface IndicadoresLeidos {
  cantidad: number;
  minutosPromedioRespuesta: number | null;
  minutosPromedioResolucion: number | null;
  cumplimientoRespuesta: ConteoCumplimiento;
  cumplimientoResolucion: ConteoCumplimiento;
  escaladasAbiertas: number;
}

export interface ResumenLeido {
  porEstado: Record<EstadoTicket, number>;
  porCategoria: { id: number; nombre: string; cantidad: number }[];
  porDependencia: { id: number | null; nombre: string | null; cantidad: number }[]; // null = sin dependencia
  porZona: { id: number; nombre: string; tipo: string; cantidad: number }[];
  indicadores: IndicadoresLeidos;
  indicadoresPorDependencia: ({ id: number; nombre: string } & IndicadoresLeidos)[];
  indicadoresPorCategoria: ({ id: number; nombre: string } & IndicadoresLeidos)[];
}

// Reportes filtrados por el alcance de reportes.ver (SPEC 11).
export interface ReporteLecturaRepository {
  // Los 8 estados, con 0 si no hay tickets en ese estado.
  contarPorEstado(filtro: FiltroTickets): Promise<Record<EstadoTicket, number>>;
  // El tablero (RF-38 y RF-39, SPEC 43), en una transacción de solo lectura REPEATABLE READ para que todas las
  // cifras sean coherentes. Con filtro null devuelve todo en cero sin consultar.
  resumen(filtro: FiltroTickets, criterios: CriteriosResumen): Promise<ResumenLeido>;
}
