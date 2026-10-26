import type { Knex } from 'knex';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type { CalendarioRepository } from '../../domain/repositories/calendario-repository';

const MS_POR_DIA = 86_400_000;

// Días de calendario en [desde, hasta], contando los dos extremos.
const diasEnRango = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA) + 1;

export class KnexCalendarioRepository implements CalendarioRepository {
  constructor(private readonly db: Knex) {}

  // to_char evita que pg convierta el date en un Date a medianoche de la zona del servidor.
  async diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]> {
    const filas: { fecha: string }[] = await this.db('calendario_laboral')
      .where('es_habil', true)
      .where('fecha', '>', desde)
      .orderBy('fecha')
      .limit(cantidad)
      .select(this.db.raw(`to_char(fecha, 'YYYY-MM-DD') as fecha`));
    return filas.map((fila) => fila.fecha);
  }

  async diasHabilesDesde(desde: string, cantidad: number): Promise<string[]> {
    const filas: { fecha: string }[] = await this.db('calendario_laboral')
      .where('es_habil', true)
      .where('fecha', '>=', desde)
      .orderBy('fecha')
      .limit(cantidad)
      .select(this.db.raw(`to_char(fecha, 'YYYY-MM-DD') as fecha`));
    return filas.map((fila) => fila.fecha);
  }

  async diasHabilesEntre(desde: string, hasta: string): Promise<string[]> {
    if (hasta < desde) {
      return [];
    }
    const filas: { fecha: string; es_habil: boolean }[] = await this.db('calendario_laboral')
      .whereBetween('fecha', [desde, hasta])
      .orderBy('fecha')
      .select(this.db.raw(`to_char(fecha, 'YYYY-MM-DD') as fecha`), 'es_habil');
    // Una fecha sin fila no se sabe si es hábil: nunca se supone.
    if (filas.length !== diasEnRango(desde, hasta)) {
      throw new ReglaDeNegocioError('CALENDARIO_INCOMPLETO', `El calendario laboral no cubre del ${desde} al ${hasta}`);
    }
    return filas.filter((fila) => fila.es_habil).map((fila) => fila.fecha);
  }
}
