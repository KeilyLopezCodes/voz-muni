import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type { DatosExtra } from '../../domain/categorias/datos-extra';
import type {
  AtencionLecturaRepository,
  EstadoAtencion,
  TicketAtencion,
} from '../../domain/repositories/atencion-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Prioridad } from '../../domain/ticket/prioridad';
import type { SlaLectura } from '../../domain/sla/sla-lectura';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';
import { COLUMNA_SLA } from './knex-sla';

// pg devuelve los bigint y los numeric como string.
interface FilaAtencion {
  id: string;
  numero: string;
  estado: EstadoAtencion;
  prioridad: Prioridad;
  titulo: string;
  descripcion: string;
  categoria_id: string;
  categoria_nombre: string;
  dependencia_id: string;
  dependencia_nombre: string;
  zona_id: string;
  zona_nombre: string;
  zona_tipo: string;
  direccion: string;
  datos_extra: DatosExtra;
  lat: string | null;
  lng: string | null;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  motivo_espera: string | null;
  traslado_pendiente: boolean;
  creado_en: Date;
  sla: SlaLectura;
}

// Del solicitante no se lee nada: ni correo, ni teléfono, ni DPI (RNF-12).
const COLUMNAS = [
  't.id',
  't.numero',
  't.estado',
  't.prioridad',
  't.titulo',
  't.descripcion',
  't.categoria_id',
  'c.nombre as categoria_nombre',
  't.dependencia_id',
  'd.nombre as dependencia_nombre',
  't.zona_id',
  'z.nombre as zona_nombre',
  'z.tipo as zona_tipo',
  't.direccion',
  't.datos_extra',
  't.lat',
  't.lng',
  'tec.id as tecnico_id',
  'tec.nombre as tecnico_nombre',
  // El motivo de la última entrada a en_espera; solo tiene sentido mientras sigue en espera.
  `(CASE WHEN t.estado = 'en_espera' THEN (
     SELECT h.motivo FROM ticket_historial h
     WHERE h.ticket_id = t.id AND h.estado_nuevo = 'en_espera'
     ORDER BY h.creado_en DESC, h.id DESC LIMIT 1
   ) END) as motivo_espera`,
  `EXISTS (
     SELECT 1 FROM solicitudes_traslado st WHERE st.ticket_id = t.id AND st.estado = 'pendiente'
   ) as traslado_pendiente`,
  't.creado_en',
  COLUMNA_SLA,
];

// Urgente primero; una prioridad nula (no debería existir después del triage) queda al final.
const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baja' THEN 3 ELSE 4 END`;

function aTicketAtencion(fila: FilaAtencion): TicketAtencion {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    prioridad: fila.prioridad,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    dependencia: { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre },
    zona: { id: Number(fila.zona_id), nombre: fila.zona_nombre, tipo: fila.zona_tipo },
    direccion: fila.direccion,
    datosExtra: fila.datos_extra ?? {},
    ubicacion: fila.lat === null || fila.lng === null ? null : { lat: Number(fila.lat), lng: Number(fila.lng) },
    tecnico: fila.tecnico_id === null ? null : { id: Number(fila.tecnico_id), nombre: fila.tecnico_nombre ?? '' },
    motivoEspera: fila.motivo_espera,
    trasladoPendiente: fila.traslado_pendiente,
    creadoEn: fila.creado_en,
    sla: fila.sla,
  };
}

export class KnexAtencionLecturaRepository implements AtencionLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(
    filtro: FiltroTickets,
    estados: readonly EstadoAtencion[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketAtencion>> {
    if (filtro === null || estados.length === 0) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarFiltro(
      this.db('tickets as t').whereIn('t.estado', estados as EstadoAtencion[]),
      filtro,
      COLUMNAS_TICKET,
      't',
    );
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaAtencion[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('dependencias as d', 'd.id', 't.dependencia_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .leftJoin('usuarios as tec', 'tec.id', 't.asignado_a')
      .select(COLUMNAS.map((columna) => (columna.includes('(') ? this.db.raw(columna) : columna)))
      .orderByRaw(`${ORDEN_PRIORIDAD}, t.creado_en ASC, t.id ASC`)
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aTicketAtencion), pagina, tamano, total: Number(total) };
  }
}
