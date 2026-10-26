import type { Knex } from 'knex';
import {
  type EscalamientoPendiente,
  type EscalamientoRepository,
} from '../../domain/repositories/escalamiento-repository';
import type { TipoPlazo } from '../../domain/ticket/ticket';

// "Cualquier estado activo" (sección 3): resuelta ya cumplió la resolución y los finales no escalan. nueva no tiene
// vencimientos y en en_espera vence_resolucion es NULL, así que la pausa no escala por resolución.
const ESTADOS_ESCALABLES = ['asignada', 'en_proceso', 'en_espera', 'en_revision'];

const RESPUESTA_VENCIDA = 't.vence_respuesta <= :ahora AND t.primera_respuesta_en IS NULL';
const RESOLUCION_VENCIDA = 't.vence_resolucion <= :ahora';

interface FilaPendiente {
  id: string;
  plazo: TipoPlazo;
  vence: Date;
}

export class KnexEscalamientoRepository implements EscalamientoRepository {
  constructor(private readonly db: Knex) {}

  async reclamarPendientes(ahora: Date, limite: number): Promise<EscalamientoPendiente[]> {
    // Si vencieron los dos plazos, gana el que venció primero (a igual instante, la respuesta).
    const plazo = `CASE WHEN (${RESPUESTA_VENCIDA}) AND (t.vence_resolucion IS NULL OR t.vence_respuesta <= t.vence_resolucion
      OR NOT (${RESOLUCION_VENCIDA})) THEN 'respuesta' ELSE 'resolucion' END`;
    const { rows }: { rows: FilaPendiente[] } = await this.db.raw(
      `
      SELECT t.id, ${plazo} AS plazo,
        CASE WHEN ${plazo} = 'respuesta' THEN t.vence_respuesta ELSE t.vence_resolucion END AS vence
      FROM tickets t
      WHERE NOT t.escalado
        AND t.estado = ANY(:estados)
        AND ((${RESPUESTA_VENCIDA}) OR ${RESOLUCION_VENCIDA})
      ORDER BY t.id
      LIMIT :limite
      FOR UPDATE SKIP LOCKED
      `,
      { ahora, limite, estados: ESTADOS_ESCALABLES },
    );
    return rows.map((fila) => ({ ticketId: Number(fila.id), plazo: fila.plazo, vence: fila.vence }));
  }

}
