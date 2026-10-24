import type { Knex } from 'knex';
import type { Rol } from '../../domain/auth/roles';
import {
  type ComentarioEditable,
  type ComentarioLeido,
  type ComentarioRepository,
  MAX_COMENTARIOS_HILO,
  type NuevoComentario,
} from '../../domain/repositories/comentario-repository';

// pg devuelve los bigint como string.
interface FilaComentario {
  id: string;
  cuerpo: string;
  es_interno: boolean;
  autor_id: string;
  autor_nombre: string;
  autor_rol: Rol;
  es_del_solicitante: boolean;
  creado_en: Date;
  editado_en: Date | null;
}

const COLUMNAS = [
  'cm.id',
  'cm.cuerpo',
  'cm.es_interno',
  'u.id as autor_id',
  'u.nombre as autor_nombre',
  'r.nombre as autor_rol',
  'cm.creado_en',
  'cm.editado_en',
];

function aComentario(fila: FilaComentario): ComentarioLeido {
  return {
    id: Number(fila.id),
    cuerpo: fila.cuerpo,
    interno: fila.es_interno,
    autor: { id: Number(fila.autor_id), nombre: fila.autor_nombre, rol: fila.autor_rol },
    esDelSolicitante: fila.es_del_solicitante,
    creadoEn: fila.creado_en,
    editadoEn: fila.editado_en,
  };
}

export class KnexComentarioRepository implements ComentarioRepository {
  constructor(private readonly db: Knex) {}

  async crear(comentario: NuevoComentario): Promise<number> {
    const [fila] = await this.db('comentarios')
      .insert({
        ticket_id: comentario.ticketId,
        autor_id: comentario.autorId,
        cuerpo: comentario.cuerpo,
        es_interno: comentario.interno,
        creado_en: comentario.creadoEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  async listar(ticketId: number, incluirInternos: boolean): Promise<ComentarioLeido[]> {
    const consulta = this.consulta().where('cm.ticket_id', ticketId);
    if (!incluirInternos) {
      consulta.where('cm.es_interno', false);
    }
    // Los más recientes primero para cortar en el máximo, y luego se devuelven en orden cronológico.
    const filas: FilaComentario[] = await consulta
      .select(this.columnas())
      .orderBy([
        { column: 'cm.creado_en', order: 'desc' },
        { column: 'cm.id', order: 'desc' },
      ])
      .limit(MAX_COMENTARIOS_HILO);
    return filas.reverse().map(aComentario);
  }

  async obtener(id: number): Promise<ComentarioLeido | null> {
    const fila: FilaComentario | undefined = await this.consulta().where('cm.id', id).first(this.columnas());
    return fila ? aComentario(fila) : null;
  }

  async obtenerDelAutor(ticketId: number, comentarioId: number, autorId: number): Promise<ComentarioEditable | null> {
    const fila: { id: string; es_interno: boolean; creado_en: Date } | undefined = await this.db('comentarios')
      .where({ id: comentarioId, ticket_id: ticketId, autor_id: autorId })
      .forUpdate()
      .first('id', 'es_interno', 'creado_en');
    return fila ? { id: Number(fila.id), interno: fila.es_interno, creadoEn: fila.creado_en } : null;
  }

  async editar(id: number, cuerpo: string, editadoEn: Date): Promise<void> {
    await this.db('comentarios').where({ id }).update({ cuerpo, editado_en: editadoEn });
  }

  private consulta(): Knex.QueryBuilder {
    return this.db('comentarios as cm')
      .join('tickets as t', 't.id', 'cm.ticket_id')
      .join('usuarios as u', 'u.id', 'cm.autor_id')
      .join('roles as r', 'r.id', 'u.rol_id');
  }

  private columnas() {
    return [...COLUMNAS, this.db.raw('(cm.autor_id = t.solicitante_id) as es_del_solicitante')];
  }
}
