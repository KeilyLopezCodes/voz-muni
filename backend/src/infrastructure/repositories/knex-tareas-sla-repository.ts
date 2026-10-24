import type { Knex } from 'knex';
import type {
  AlertaPendiente,
  EscalamientoPendiente,
  TareasSlaRepository,
} from '../../domain/repositories/tareas-sla-repository';
import type { TipoPlazo } from '../../domain/sla/vencimientos';

const ACTIVOS_ESCALABLES = ['asignada', 'en_proceso', 'en_espera', 'en_revision'];

const COLUMNA_ENVIADA: Readonly<Record<TipoPlazo, string>> = {
  respuesta: 'alerta_respuesta_enviada_en',
  resolucion: 'alerta_resolucion_enviada_en',
};

export class KnexTareasSlaRepository implements TareasSlaRepository {
  constructor(private readonly db: Knex) {}

  async reclamarAlertas(ahora: Date, limite: number): Promise<AlertaPendiente[]> {
    const respuesta: { id: string; vence: Date; dependencia_id: string | null; asignado_a: string | null }[] =
      await this.db('tickets')
        .whereNotNull('alerta_respuesta_en')
        .where('alerta_respuesta_en', '<=', ahora)
        .whereNull('alerta_respuesta_enviada_en')
        .whereNull('primera_respuesta_en')
        .whereIn('estado', ['asignada', 'en_proceso'])
        .orderBy('alerta_respuesta_en')
        .limit(limite)
        .forUpdate()
        .skipLocked()
        .select('id', 'vence_respuesta as vence', 'dependencia_id', 'asignado_a');
    const resolucion: typeof respuesta = await this.db('tickets')
      .whereNotNull('alerta_resolucion_en')
      .where('alerta_resolucion_en', '<=', ahora)
      .whereNull('alerta_resolucion_enviada_en')
      .whereIn('estado', ['asignada', 'en_proceso'])
      .orderBy('alerta_resolucion_en')
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select('id', 'vence_resolucion as vence', 'dependencia_id', 'asignado_a');
    const aAlerta = (plazo: TipoPlazo) => (fila: (typeof respuesta)[number]): AlertaPendiente => ({
      ticketId: Number(fila.id),
      plazo,
      vence: fila.vence,
      dependenciaId: fila.dependencia_id === null ? null : Number(fila.dependencia_id),
      asignadoA: fila.asignado_a === null ? null : Number(fila.asignado_a),
    });
    return [...respuesta.map(aAlerta('respuesta')), ...resolucion.map(aAlerta('resolucion'))];
  }

  async marcarAlertaEnviada(ticketId: number, plazo: TipoPlazo, ahora: Date): Promise<void> {
    await this.db('tickets').where({ id: ticketId }).update({ [COLUMNA_ENVIADA[plazo]]: ahora });
  }

  async reclamarEscalamientos(ahora: Date, limite: number): Promise<EscalamientoPendiente[]> {
    const filas: { id: string; vence_respuesta: Date | null; vence_resolucion: Date | null; primera_respuesta_en: Date | null }[] =
      await this.db('tickets')
        .where('escalado', false)
        .whereIn('estado', ACTIVOS_ESCALABLES)
        .where((q) =>
          q
            .where((r) => r.where('vence_respuesta', '<=', ahora).whereNull('primera_respuesta_en'))
            .orWhere('vence_resolucion', '<=', ahora),
        )
        .orderBy('id')
        .limit(limite)
        .forUpdate()
        .skipLocked()
        .select('id', 'vence_respuesta', 'vence_resolucion', 'primera_respuesta_en');
    return filas.map((fila) => {
      const respuestaVencida =
        fila.primera_respuesta_en === null && fila.vence_respuesta !== null && fila.vence_respuesta <= ahora;
      const resolucionVencida = fila.vence_resolucion !== null && fila.vence_resolucion <= ahora;
      // Si vencieron los dos, el más antiguo.
      const plazo: TipoPlazo =
        respuestaVencida && (!resolucionVencida || fila.vence_respuesta! <= fila.vence_resolucion!)
          ? 'respuesta'
          : 'resolucion';
      return {
        ticketId: Number(fila.id),
        plazo,
        vence: plazo === 'respuesta' ? fila.vence_respuesta! : fila.vence_resolucion!,
      };
    });
  }

  async reclamarCierres(ahora: Date, limite: number): Promise<number[]> {
    const filas: { id: string }[] = await this.db('tickets')
      .where('estado', 'resuelta')
      .whereNotNull('confirmacion_vence_en')
      .where('confirmacion_vence_en', '<', ahora)
      .orderBy('confirmacion_vence_en')
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select('id');
    return filas.map((fila) => Number(fila.id));
  }

  async contarResueltasSinPlazo(): Promise<number> {
    const [{ total }] = await this.db('tickets').where('estado', 'resuelta').whereNull('confirmacion_vence_en').count({ total: '*' });
    return Number(total);
  }
}
