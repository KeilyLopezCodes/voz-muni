import type { Knex } from 'knex';
import type { CalendarioRepository } from '../../domain/repositories/calendario-repository';

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
    const filas: { fecha: string }[] = await this.db('calendario_laboral')
      .where('es_habil', true)
      .whereBetween('fecha', [desde, hasta])
      .orderBy('fecha')
      .select(this.db.raw(`to_char(fecha, 'YYYY-MM-DD') as fecha`));
    return filas.map((fila) => fila.fecha);
  }
}
