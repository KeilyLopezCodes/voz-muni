import type { Knex } from 'knex';
import type { Rol } from '../../domain/auth/roles';
import type {
  DetalleEvento,
  EventoLeido,
  FiltroLineaTiempo,
  LineaTiempoRepository,
} from '../../domain/repositories/linea-tiempo-repository';

interface FilaEvento {
  id: string;
  ocurrido_en: Date;
  ocurrido_us: string; // instante con microsegundos, para el cursor
  actor_id: string | null;
  actor_nombre: string | null;
  actor_rol: Rol | null;
  detalle: DetalleEvento;
}

// Instante con microsegundos: el cursor no puede perder precisión frente a timestamptz.
export const INSTANTE_US = `to_char(e.ocurrido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// UNION ALL de las cinco fuentes (SPEC 28). Los filtros de visibilidad van dentro de cada rama.
function ramas(filtro: FiltroLineaTiempo): string[] {
  const soloPublicos = filtro.incluirInternos ? '' : ' AND NOT c.es_interno';
  const soloAdjuntosPublicos = filtro.incluirInternos ? '' : ' AND NOT j.interno';
  const lista = [
    `SELECT 'estado:' || h.id AS id, h.creado_en AS ocurrido_en, h.usuario_id AS actor_id,
       jsonb_build_object('tipo', 'estado', 'estadoAnterior', h.estado_anterior, 'estadoNuevo', h.estado_nuevo,
         'motivo', h.motivo) AS detalle
     FROM ticket_historial h WHERE h.ticket_id = :ticketId`,
    `SELECT 'comentario:' || c.id, c.creado_en, c.autor_id,
       jsonb_build_object('tipo', 'comentario', 'comentarioId', c.id, 'interno', c.es_interno)
     FROM comentarios c WHERE c.ticket_id = :ticketId${soloPublicos}`,
    `SELECT 'adjunto:' || j.id, j.creado_en, j.subido_por,
       jsonb_build_object('tipo', 'adjunto', 'adjuntoId', j.id, 'nombre', j.nombre, 'interno', j.interno)
     FROM adjuntos j WHERE j.ticket_id = :ticketId${soloAdjuntosPublicos}`,
  ];
  if (!filtro.vistaPublica) {
    lista.push(
      `SELECT 'asignacion:' || a.id, a.creado_en, a.asignado_por,
         jsonb_build_object('tipo', 'asignacion',
           'tecnicoAnterior', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object('id', ta.id, 'nombre', ta.nombre) END,
           'tecnicoNuevo', jsonb_build_object('id', tn.id, 'nombre', tn.nombre), 'motivo', a.motivo)
       FROM ticket_asignaciones a
       JOIN usuarios tn ON tn.id = a.tecnico_nuevo
       LEFT JOIN usuarios ta ON ta.id = a.tecnico_anterior
       WHERE a.ticket_id = :ticketId`,
      // Un traslado directo del supervisor no es una solicitud: el cambio de estado ya lo muestra.
      `SELECT 'traslado_solicitado:' || s.id, s.creado_en, s.solicitado_por,
         jsonb_build_object('tipo', 'traslado_solicitado', 'solicitudId', s.id, 'dependenciaOrigen', dor.nombre,
           'dependenciaSugerida', dsu.nombre, 'motivo', s.motivo)
       FROM solicitudes_traslado s
       JOIN dependencias dor ON dor.id = s.dependencia_origen_id
       LEFT JOIN dependencias dsu ON dsu.id = s.dependencia_sugerida_id
       WHERE s.ticket_id = :ticketId
         AND NOT (s.estado = 'aprobada' AND s.solicitado_por = s.resuelto_por AND s.creado_en = s.resuelto_en)`,
      // Una aprobación no tiene evento propio: ya aparece como el cambio de estado a en_revision.
      `SELECT tipo || ':' || s.id, s.resuelto_en, s.resuelto_por,
         jsonb_build_object('tipo', tipo, 'solicitudId', s.id,
           'motivo', CASE WHEN s.estado = 'rechazada' THEN s.motivo_resolucion END)
       FROM solicitudes_traslado s,
         LATERAL (SELECT CASE s.estado WHEN 'rechazada' THEN 'traslado_rechazado'
           WHEN 'retirada' THEN 'traslado_retirado' ELSE 'traslado_sin_efecto' END AS tipo) t
       WHERE s.ticket_id = :ticketId AND s.estado IN ('rechazada', 'retirada', 'sin_efecto')`,
    );
  }
  return lista;
}

export class KnexLineaTiempoRepository implements LineaTiempoRepository {
  constructor(private readonly db: Knex) {}

  async listar(ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLeido[]> {
    const cursor = filtro.antesDe
      ? `WHERE (e.ocurrido_en, e.id COLLATE "C") < (:antesEn::timestamptz, :antesId COLLATE "C")`
      : '';
    const sql = `
      WITH eventos AS (${ramas(filtro).join('\nUNION ALL\n')})
      SELECT e.id, e.ocurrido_en, ${INSTANTE_US} AS ocurrido_us, e.actor_id, e.detalle,
        u.nombre AS actor_nombre, r.nombre AS actor_rol
      FROM eventos e
      LEFT JOIN usuarios u ON u.id = e.actor_id
      LEFT JOIN roles r ON r.id = u.rol_id
      ${cursor}
      ORDER BY e.ocurrido_en DESC, e.id COLLATE "C" DESC
      LIMIT :limite`;
    const { rows } = (await this.db.raw(sql, {
      ticketId,
      limite: filtro.limite,
      ...(filtro.antesDe ? { antesEn: filtro.antesDe.ocurridoEn, antesId: filtro.antesDe.id } : {}),
    })) as { rows: FilaEvento[] };
    return rows.map((fila) => ({
      id: fila.id,
      ocurridoEn: fila.ocurrido_en,
      ocurridoUs: fila.ocurrido_us,
      actor:
        fila.actor_id === null
          ? null
          : { id: Number(fila.actor_id), nombre: fila.actor_nombre ?? '', rol: fila.actor_rol as Rol },
      detalle: fila.detalle,
    }));
  }
}
