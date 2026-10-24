import type { Knex } from 'knex';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type { DatosExtra } from '../../domain/categorias/datos-extra';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type {
  EstadoTriage,
  TicketTriage,
  TriageLecturaRepository,
} from '../../domain/repositories/triage-lectura-repository';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

// pg devuelve los bigint y los numeric como string.
interface FilaTriage {
  id: string;
  numero: string;
  estado: EstadoTriage;
  titulo: string;
  descripcion: string;
  categoria_id: string;
  categoria_nombre: string;
  zona_id: string;
  zona_nombre: string;
  zona_tipo: string;
  direccion: string;
  canal: string;
  datos_extra: DatosExtra;
  lat: string | null;
  lng: string | null;
  solicitante_nombre: string;
  creado_en: Date;
}

// Del solicitante solo el nombre: nunca el correo, el teléfono ni el DPI (RNF-12).
const COLUMNAS = [
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
  't.canal',
  't.datos_extra',
  't.lat',
  't.lng',
  'u.nombre as solicitante_nombre',
  't.creado_en',
];

function aTicketTriage(fila: FilaTriage): TicketTriage {
  return {
    id: Number(fila.id),
    numero: fila.numero,
    estado: fila.estado,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    categoria: { id: Number(fila.categoria_id), nombre: fila.categoria_nombre },
    zona: { id: Number(fila.zona_id), nombre: fila.zona_nombre, tipo: fila.zona_tipo },
    direccion: fila.direccion,
    canal: fila.canal,
    datosExtra: fila.datos_extra ?? {},
    // El CHECK tickets_ubicacion_completa garantiza que vienen las dos o ninguna.
    ubicacion: fila.lat === null || fila.lng === null ? null : { lat: Number(fila.lat), lng: Number(fila.lng) },
    solicitanteNombre: fila.solicitante_nombre,
    creadoEn: fila.creado_en,
  };
}

export class KnexTriageLecturaRepository implements TriageLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(
    filtro: FiltroTickets,
    estados: readonly EstadoTriage[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketTriage>> {
    if (filtro === null || estados.length === 0) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarFiltro(
      this.db('tickets as t').whereIn('t.estado', estados as EstadoTriage[]),
      filtro,
      COLUMNAS_TICKET,
      't',
    );
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: FilaTriage[] = await consulta
      .join('categorias as c', 'c.id', 't.categoria_id')
      .join('zonas as z', 'z.id', 't.zona_id')
      .join('usuarios as u', 'u.id', 't.solicitante_id')
      .select(COLUMNAS)
      .orderBy([
        { column: 't.creado_en', order: 'asc' },
        { column: 't.id', order: 'asc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aTicketTriage), pagina, tamano, total: Number(total) };
  }
}
