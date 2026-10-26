import type { Knex } from 'knex';
import type { OrigenAdjunto } from '../../domain/adjuntos/reglas-adjuntos';
import type { Rol } from '../../domain/auth/roles';
import type { FiltroTickets } from '../../domain/autorizacion/alcance-tickets';
import type {
  AdjuntoLeido,
  AdjuntoRepository,
  NuevoAdjunto,
  TicketParaAdjuntar,
} from '../../domain/repositories/adjunto-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import { aplicarFiltro, COLUMNAS_TICKET } from './knex-filtro';

// pg devuelve los bigint como string.
interface FilaAdjunto {
  id: string;
  nombre: string;
  ruta: string;
  tipo_mime: string;
  tamano_bytes: number;
  interno: boolean;
  origen: OrigenAdjunto;
  autor_id: string;
  autor_nombre: string;
  autor_rol: Rol;
  creado_en: Date;
}

const COLUMNAS = [
  'a.id',
  'a.nombre',
  'a.ruta',
  'a.tipo_mime',
  'a.tamano_bytes',
  'a.interno',
  'a.origen',
  'u.id as autor_id',
  'u.nombre as autor_nombre',
  'r.nombre as autor_rol',
  'a.creado_en',
];

function aAdjunto(fila: FilaAdjunto): AdjuntoLeido {
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    ruta: fila.ruta,
    mime: fila.tipo_mime,
    tamanoBytes: Number(fila.tamano_bytes),
    interno: fila.interno,
    origen: fila.origen,
    subidoPor: { id: Number(fila.autor_id), nombre: fila.autor_nombre, rol: fila.autor_rol },
    creadoEn: fila.creado_en,
  };
}

export class KnexAdjuntoRepository implements AdjuntoRepository {
  constructor(private readonly db: Knex) {}

  async ticketParaAdjuntar(id: number, filtro: FiltroTickets): Promise<TicketParaAdjuntar | null> {
    if (filtro === null) {
      return null;
    }
    const fila:
      | { id: string; estado: EstadoTicket; solicitante_id: string; registrado_por: string | null; dependencia_id: string | null }
      | undefined = await aplicarFiltro(this.db('tickets as t').where('t.id', id), filtro, COLUMNAS_TICKET, 't')
      .forUpdate()
      .first('t.id', 't.estado', 't.solicitante_id', 't.registrado_por', 't.dependencia_id');
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      estado: fila.estado,
      solicitanteId: Number(fila.solicitante_id),
      registradoPor: fila.registrado_por === null ? null : Number(fila.registrado_por),
      dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
    };
  }

  async contarPorOrigen(ticketId: number, origen: OrigenAdjunto): Promise<number> {
    const [{ total }] = await this.db('adjuntos').where({ ticket_id: ticketId, origen }).count({ total: '*' });
    return Number(total);
  }

  async crear(adjunto: NuevoAdjunto): Promise<number> {
    const [fila] = await this.db('adjuntos')
      .insert({
        ticket_id: adjunto.ticketId,
        nombre: adjunto.nombre,
        ruta: adjunto.ruta,
        tipo_mime: adjunto.mime,
        tamano_bytes: adjunto.tamanoBytes,
        subido_por: adjunto.subidoPor,
        interno: adjunto.interno,
        origen: adjunto.origen,
        creado_en: adjunto.creadoEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  async listar(ticketId: number, incluirInternos: boolean): Promise<AdjuntoLeido[]> {
    const filas: FilaAdjunto[] = await this.visibles(ticketId, incluirInternos)
      .select(COLUMNAS)
      .orderBy([
        { column: 'a.creado_en', order: 'asc' },
        { column: 'a.id', order: 'asc' },
      ]);
    return filas.map(aAdjunto);
  }

  async obtener(ticketId: number, adjuntoId: number, incluirInternos: boolean): Promise<AdjuntoLeido | null> {
    const fila: FilaAdjunto | undefined = await this.visibles(ticketId, incluirInternos)
      .where('a.id', adjuntoId)
      .first(COLUMNAS);
    return fila ? aAdjunto(fila) : null;
  }

  async obtenerDelAutor(ticketId: number, adjuntoId: number, autorId: number): Promise<AdjuntoLeido | null> {
    const fila: FilaAdjunto | undefined = await this.base()
      .where({ 'a.ticket_id': ticketId, 'a.id': adjuntoId, 'a.subido_por': autorId })
      .forUpdate('a')
      .first(COLUMNAS);
    return fila ? aAdjunto(fila) : null;
  }

  async borrar(id: number): Promise<void> {
    await this.db('adjuntos').where({ id }).delete();
  }

  private base(): Knex.QueryBuilder {
    return this.db('adjuntos as a').join('usuarios as u', 'u.id', 'a.subido_por').join('roles as r', 'r.id', 'u.rol_id');
  }

  // Los internos se filtran en el WHERE, nunca después en memoria (RNF-12).
  private visibles(ticketId: number, incluirInternos: boolean): Knex.QueryBuilder {
    const consulta = this.base().where('a.ticket_id', ticketId);
    if (!incluirInternos) {
      consulta.where('a.interno', false);
    }
    return consulta;
  }
}
