import type { Knex } from 'knex';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { Encuesta, EncuestaRepository } from '../../domain/repositories/encuesta-repository';

const VIOLACION_UNICA = '23505';

export class KnexEncuestaRepository implements EncuestaRepository {
  constructor(private readonly db: Knex) {}

  async obtener(ticketId: number): Promise<Encuesta | null> {
    const fila: { calificacion: number; comentario: string | null; creado_en: Date } | undefined = await this.db('encuestas')
      .where({ ticket_id: ticketId })
      .first('calificacion', 'comentario', 'creado_en');
    return fila ? { calificacion: fila.calificacion, comentario: fila.comentario, creadoEn: fila.creado_en } : null;
  }

  async crear(ticketId: number, encuesta: Encuesta): Promise<void> {
    try {
      await this.db('encuestas').insert({
        ticket_id: ticketId,
        calificacion: encuesta.calificacion,
        comentario: encuesta.comentario,
        creado_en: encuesta.creadoEn,
      });
    } catch (error) {
      if ((error as { code?: string }).code === VIOLACION_UNICA) {
        throw new ReglaDeNegocioError('ENCUESTA_EXISTENTE', 'Esta queja ya tiene una calificación');
      }
      throw error;
    }
  }
}
