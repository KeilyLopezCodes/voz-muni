import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type {
  CriteriosListado,
  Pagina,
  ResolucionLectura,
  TicketDetalleLectura,
  TicketLecturaRepository,
  TicketListado,
  TicketResumen,
} from '../../domain/repositories/ticket-lectura-repository';
import type { Busqueda } from '../../domain/ticket/busqueda';
import { ESTADOS_TICKET, type EstadoTicket } from '../../domain/ticket/estado-ticket';
import { COLUMNAS_SLA_LECTURA, type FilaSlaLectura, slaDeFila } from './knex-sla';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

// pg devuelve los bigint como string.
interface FilaTicket {
  id: string;
  numero: string;
  estado: EstadoTicket;
  creado_en: Date;
  solicitante_id: string;
  registrado_por: string | null;
  asignado_a: string | null;
  dependencia_id: string | null;
}

const COLUMNAS = [
  't.id',
  't.numero',
  't.estado',
  't.creado_en',
  't.solicitante_id',
  't.registrado_por',
  't.asignado_a',
  't.dependencia_id',
];

interface FilaListado {
  id: string;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  creado_en: Date;
  confirmacion_vence_en: Date | null;
  cerrado_en: Date | null;
  solicitante_id: string;
  tiene_encuesta: boolean;
}

interface FilaDetalle {
  id: string;
  numero: string;
  estado: EstadoTicket;
  titulo: string;
  descripcion: string;
  categoria_id: string;
  categoria_nombre: string;
  zona_id: string;
  zona_nombre: string;
  zona_tipo: string;
  direccion: string;
  dependencia_id: string | null;
  dependencia_nombre: string | null;
  creado_en: Date;
  resuelto_en: Date | null;
  cerrado_en: Date | null;
  informacion_solicitada: string | null;
  cierre_automatico: boolean;
  resolucion: string | null;
  resuelto_por: string | null;
  resuelto_por_nombre: string | null;
  confirmacion_vence_en: Date | null;
  reaperturas: number;
  solicitante_id: string;
  encuesta_calificacion: number | null;
  encuesta_comentario: string | null;
  encuesta_creado_en: Date | null;
}

// Del solicitante solo el id: ni correo, ni teléfono, ni DPI (RNF-12). Tampoco prioridad, técnico,
// coordenadas ni datos adicionales (SPEC 25).
const COLUMNAS_DETALLE = [
  't.id',
  't.numero',
  't.estado',
  't.titulo',
  't.descripcion',
  't.categoria_id',
  'c.nombre as categoria_nombre',
  't.zona_id',
  'z.nombre as zona_nombre',
  'z.tipo as zona_tipo',
  't.direccion',
  't.dependencia_id',
  'd.nombre as dependencia_nombre',
  't.creado_en',
  't.resuelto_en',
  't.cerrado_en',
  't.resolucion',
  't.resuelto_por',
  'rp.nombre as resuelto_por_nombre',
  't.confirmacion_vence_en',
  't.reaperturas',
  ...COLUMNAS_SLA_LECTURA,
  't.solicitante_id',
  'en.calificacion as encuesta_calificacion',
  'en.comentario as encuesta_comentario',
  'en.creado_en as encuesta_creado_en',
];

// La resolución vigente solo se muestra en resuelta o cerrada (SPEC 26).
const ESTADOS_CON_RESOLUCION: readonly EstadoTicket[] = ['resuelta', 'cerrada'];

// Misma fuente que motivoEspera de SPEC 22: el motivo de la última entrada a en_espera, solo mientras sigue en espera.
const INFORMACION_SOLICITADA = `(CASE WHEN t.estado = 'en_espera' THEN (
   SELECT h.motivo FROM ticket_historial h
   WHERE h.ticket_id = t.id AND h.estado_nuevo = 'en_espera'
   ORDER BY h.creado_en DESC, h.id DESC LIMIT 1
 ) END) as informacion_solicitada`;

// Cerrada por el job de SLA (SPEC 33): la última transición a cerrada no tiene usuario, igual que la consulta de
// arriba con en_espera. Sin columna nueva: sale del historial.
const CIERRE_AUTOMATICO = `COALESCE(t.estado = 'cerrada' AND (
   SELECT h.usuario_id IS NULL FROM ticket_historial h
   WHERE h.ticket_id = t.id AND h.estado_nuevo = 'cerrada'
   ORDER BY h.creado_en DESC, h.id DESC LIMIT 1
 ), false) as cierre_automatico`;

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

// Número exacto, o subcadena del título o del número con los comodines ya escapados en el dominio (SPEC 38).
function aplicarBusqueda(consulta: Knex.QueryBuilder, busqueda: Busqueda | null): Knex.QueryBuilder {
  if (busqueda?.tipo === 'numero') {
    consulta.where('t.numero', busqueda.numero);
  } else if (busqueda?.tipo === 'texto') {
    consulta.where((o) => o.whereILike('t.titulo', busqueda.patron).orWhereILike('t.numero', busqueda.patron));
  }
  return consulta;
}

function aResumen(fila: FilaTicket): TicketResumen {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    solicitanteId: Number(fila.solicitante_id),
    registradoPor: numeroONull(fila.registrado_por),
    asignadoA: numeroONull(fila.asignado_a),
    dependenciaId: numeroONull(fila.dependencia_id),
  };
}

function aDetalle(fila: FilaDetalle & FilaSlaLectura): TicketDetalleLectura {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    zona: { id: Number(fila.zona_id), nombre: fila.zona_nombre, tipo: fila.zona_tipo },
    direccion: fila.direccion,
    dependencia:
      fila.dependencia_id === null ? null : { id: Number(fila.dependencia_id), nombre: fila.dependencia_nombre ?? '' },
    creadoEn: fila.creado_en,
    resueltoEn: fila.resuelto_en,
    cerradoEn: fila.cerrado_en,
    informacionSolicitada: fila.informacion_solicitada,
    cierreAutomatico: fila.cierre_automatico,
    resolucion: aResolucion(fila),
    confirmacionVenceEn: fila.confirmacion_vence_en,
    reaperturas: fila.reaperturas,
    sla: slaDeFila(fila),
    solicitanteId: Number(fila.solicitante_id),
    encuesta:
      fila.encuesta_calificacion === null
        ? null
        : { calificacion: fila.encuesta_calificacion, comentario: fila.encuesta_comentario, creadoEn: fila.encuesta_creado_en! },
  };
}

function aResolucion(fila: FilaDetalle): ResolucionLectura | null {
  if (!ESTADOS_CON_RESOLUCION.includes(fila.estado) || fila.resolucion === null || fila.resuelto_en === null) {
    return null;
  }
  return {
    descripcion: fila.resolucion,
    resueltaEn: fila.resuelto_en,
    resueltaPor:
      fila.resuelto_por === null ? null : { id: Number(fila.resuelto_por), nombre: fila.resuelto_por_nombre ?? '' },
  };
}

export class KnexTicketLecturaRepository implements TicketLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarFiltro(this.db('tickets as t'), filtro, COLUMNAS_TICKET, 't');
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaTicket[] = await consulta
      .select(COLUMNAS)
      .orderBy([
        { column: 't.creado_en', order: 'desc' },
        { column: 't.id', order: 'desc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aResumen), pagina, tamano, total: Number(total) };
  }

  async obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null> {
    if (filtro === null) {
      return null;
    }
    const fila: FilaTicket | undefined = await aplicarFiltro(
      this.db('tickets as t').where('t.id', id),
      filtro,
      COLUMNAS_TICKET,
      't',
    ).first(COLUMNAS);
    return fila ? aResumen(fila) : null;
  }

  async listarConTitulo(
    filtro: FiltroTickets,
    criterios: CriteriosListado,
    pagina: number,
    tamano: number,
    ahora: Date,
  ): Promise<Pagina<TicketListado>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarBusqueda(aplicarFiltro(this.db('tickets as t'), filtro, COLUMNAS_TICKET, 't'), criterios.busqueda);
    if (criterios.estados.length > 0) {
      consulta.whereIn('t.estado', [...criterios.estados]);
    }
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaListado[] = await consulta
      .select([
        't.id',
        't.numero',
        't.titulo',
        't.estado',
        't.creado_en',
        't.confirmacion_vence_en',
        't.cerrado_en',
        't.solicitante_id',
        this.db.raw('EXISTS (SELECT 1 FROM encuestas en WHERE en.ticket_id = t.id) as tiene_encuesta'),
      ])
      // Lo que pide acción primero (SPEC 38): la respuesta del vecino y la confirmación con plazo vigente.
      .orderByRaw(
        `(CASE WHEN t.estado = 'en_espera' THEN 0
               WHEN t.estado = 'resuelta' AND t.confirmacion_vence_en >= ? THEN 1
               ELSE 2 END), t.creado_en DESC, t.id DESC`,
        [ahora],
      )
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    const datos = filas.map((fila) => ({
      id: Number(fila.id),
      numero: fila.numero,
      titulo: fila.titulo,
      estado: fila.estado,
      creadoEn: fila.creado_en,
      esperaRespuesta: fila.estado === 'en_espera',
      confirmacionVenceEn: fila.estado === 'resuelta' ? fila.confirmacion_vence_en : null,
      cerradoEn: fila.cerrado_en,
      tieneEncuesta: fila.tiene_encuesta,
      solicitanteId: Number(fila.solicitante_id),
    }));
    return { datos, pagina, tamano, total: Number(total) };
  }

  async contarPorEstado(filtro: FiltroTickets, busqueda: Busqueda | null): Promise<Record<EstadoTicket, number>> {
    const conteo = Object.fromEntries(ESTADOS_TICKET.map((estado) => [estado, 0])) as Record<EstadoTicket, number>;
    if (filtro === null) {
      return conteo;
    }
    const filas: { estado: EstadoTicket; total: string }[] = await aplicarBusqueda(
      aplicarFiltro(this.db('tickets as t'), filtro, COLUMNAS_TICKET, 't'),
      busqueda,
    )
      .groupBy('t.estado')
      .select('t.estado', this.db.raw('count(*) as total'));
    for (const fila of filas) {
      conteo[fila.estado] = Number(fila.total);
    }
    return conteo;
  }

  async obtenerDetalle(id: number, filtro: FiltroTickets): Promise<TicketDetalleLectura | null> {
    if (filtro === null) {
      return null;
    }
    const fila: (FilaDetalle & FilaSlaLectura) | undefined = await aplicarFiltro(
      this.db('tickets as t').where('t.id', id),
      filtro,
      COLUMNAS_TICKET,
      't',
    )
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .leftJoin('dependencias as d', 'd.id', 't.dependencia_id')
      .leftJoin('usuarios as rp', 'rp.id', 't.resuelto_por')
      .leftJoin('encuestas as en', 'en.ticket_id', 't.id')
      .first([...COLUMNAS_DETALLE, this.db.raw(INFORMACION_SOLICITADA), this.db.raw(CIERRE_AUTOMATICO)]);
    return fila ? aDetalle(fila) : null;
  }
}
