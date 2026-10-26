import type { Knex } from 'knex';
import type { Rol } from '../../domain/auth/roles';
import type {
  ActorEvento,
  DetalleEvento,
  EventoLineaTiempo,
  FiltroLineaTiempo,
  LineaTiempoRepository,
  TipoEvento,
} from '../../domain/repositories/linea-tiempo-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { TipoPlazo } from '../../domain/ticket/ticket';

// pg devuelve los bigint como string.
interface FilaEvento {
  id: string;
  tipo: TipoEvento;
  origen_id: string;
  ocurrido_en: Date;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_rol: Rol | null;
  actor_es_solicitante: boolean | null;
  motivo: string | null;
  estado_anterior: EstadoTicket | null;
  estado_nuevo: EstadoTicket | null;
  tecnico_anterior_id: string | null;
  tecnico_anterior_nombre: string | null;
  tecnico_nuevo_id: string | null;
  tecnico_nuevo_nombre: string | null;
  dependencia_origen: string | null;
  dependencia_sugerida: string | null;
  interno: boolean | null;
  nombre_adjunto: string | null;
}

// Cada rama devuelve las mismas columnas, en el mismo orden. El instante se trunca a milisegundos: es la precisión
// de Date en el cursor, y así el orden de la consulta y el del cursor coinciden.
const COLUMNAS = `tipo, origen_id, ocurrido_en, actor_id, motivo, estado_anterior, estado_nuevo,
  tecnico_anterior_id, tecnico_nuevo_id, dependencia_origen_id, dependencia_sugerida_id, interno, nombre_adjunto`;

const RAMA_ESTADO = `
  SELECT 'estado', h.id, date_trunc('milliseconds', h.creado_en), h.usuario_id, h.motivo,
    h.estado_anterior::text, h.estado_nuevo::text, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
    NULL::boolean, NULL::text
  FROM ticket_historial h WHERE h.ticket_id = :ticketId`;

const RAMA_ASIGNACION = `
  SELECT 'asignacion', a.id, date_trunc('milliseconds', a.creado_en), a.asignado_por, a.motivo,
    NULL, NULL, a.tecnico_anterior, a.tecnico_nuevo, NULL, NULL, NULL, NULL
  FROM ticket_asignaciones a WHERE a.ticket_id = :ticketId`;

// Un traslado directo del supervisor (SPEC 21) se guarda ya aprobado por quien lo pidió: el cambio de estado a
// en_revision ya lo muestra.
const RAMA_TRASLADO_SOLICITADO = `
  SELECT 'traslado_solicitado', s.id, date_trunc('milliseconds', s.creado_en), s.solicitado_por, s.motivo,
    NULL, NULL, NULL, NULL, s.dependencia_origen_id, s.dependencia_sugerida_id, NULL, NULL
  FROM solicitudes_traslado s
  WHERE s.ticket_id = :ticketId AND NOT (s.estado = 'aprobada' AND s.resuelto_por = s.solicitado_por)`;

// Una solicitud aprobada no tiene evento propio: la aprobación es el cambio de estado a en_revision.
const RAMA_TRASLADO_RESUELTO = `
  SELECT CASE s.estado WHEN 'rechazada' THEN 'traslado_rechazado' WHEN 'retirada' THEN 'traslado_retirado'
      ELSE 'traslado_sin_efecto' END,
    s.id, date_trunc('milliseconds', s.resuelto_en), s.resuelto_por,
    CASE WHEN s.estado = 'rechazada' THEN s.motivo_resolucion END,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM solicitudes_traslado s
  WHERE s.ticket_id = :ticketId AND s.estado IN ('rechazada', 'retirada', 'sin_efecto')`;

// El escalamiento vigente (SPEC 32): reabrir limpia escalado_en, así que uno anterior no aparece. El plazo viaja en
// la columna motivo; el actor es el sistema.
const RAMA_ESCALAMIENTO = `
  SELECT 'escalamiento', t.id, date_trunc('milliseconds', t.escalado_en), NULL::bigint, t.escalado_por,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM tickets t WHERE t.id = :ticketId AND t.escalado_en IS NOT NULL`;

const RAMA_COMENTARIO = (soloPublicos: boolean) => `
  SELECT 'comentario', cm.id, date_trunc('milliseconds', cm.creado_en), cm.autor_id, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, cm.es_interno, NULL
  FROM comentarios cm WHERE cm.ticket_id = :ticketId${soloPublicos ? ' AND cm.es_interno = false' : ''}`;

const RAMA_ADJUNTO = (soloPublicos: boolean) => `
  SELECT 'adjunto', ad.id, date_trunc('milliseconds', ad.creado_en), ad.subido_por, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, ad.interno, ad.nombre
  FROM adjuntos ad WHERE ad.ticket_id = :ticketId${soloPublicos ? ' AND ad.interno = false' : ''}`;

function aActor(fila: FilaEvento): ActorEvento {
  if (fila.actor_id === null) {
    return { tipo: 'sistema' };
  }
  return {
    tipo: 'usuario',
    id: Number(fila.actor_id),
    nombre: fila.actor_nombre!,
    rol: fila.actor_rol!,
    esSolicitante: fila.actor_es_solicitante === true,
  };
}

function aDetalle(fila: FilaEvento): DetalleEvento {
  const origenId = Number(fila.origen_id);
  switch (fila.tipo) {
    case 'estado':
      return { tipo: 'estado', estadoAnterior: fila.estado_anterior, estadoNuevo: fila.estado_nuevo!, motivo: fila.motivo };
    case 'asignacion':
      return {
        tipo: 'asignacion',
        tecnicoAnterior:
          fila.tecnico_anterior_id === null
            ? null
            : { id: Number(fila.tecnico_anterior_id), nombre: fila.tecnico_anterior_nombre! },
        tecnicoNuevo: { id: Number(fila.tecnico_nuevo_id), nombre: fila.tecnico_nuevo_nombre! },
        motivo: fila.motivo,
      };
    case 'traslado_solicitado':
      return {
        tipo: 'traslado_solicitado',
        solicitudId: origenId,
        dependenciaOrigen: fila.dependencia_origen!,
        dependenciaSugerida: fila.dependencia_sugerida,
        motivo: fila.motivo!,
      };
    case 'traslado_rechazado':
    case 'traslado_retirado':
    case 'traslado_sin_efecto':
      return { tipo: fila.tipo, solicitudId: origenId, motivo: fila.motivo };
    case 'comentario':
      return { tipo: 'comentario', comentarioId: origenId, interno: fila.interno === true };
    case 'adjunto':
      return { tipo: 'adjunto', adjuntoId: origenId, nombre: fila.nombre_adjunto!, interno: fila.interno === true };
    case 'escalamiento':
      return { tipo: 'escalamiento', plazo: fila.motivo as TipoPlazo };
  }
}

export class KnexLineaTiempoRepository implements LineaTiempoRepository {
  constructor(private readonly db: Knex) {}

  async listar(ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLineaTiempo[]> {
    // La visibilidad va dentro de cada rama: lo que el usuario no ve ni siquiera se lee.
    const soloPublicos = filtro.vistaPublica || !filtro.incluirInternos;
    const ramas = [RAMA_ESTADO];
    if (!filtro.vistaPublica) {
      ramas.push(RAMA_ASIGNACION, RAMA_TRASLADO_SOLICITADO, RAMA_TRASLADO_RESUELTO, RAMA_ESCALAMIENTO);
    }
    ramas.push(RAMA_COMENTARIO(soloPublicos), RAMA_ADJUNTO(soloPublicos));

    // El desempate es el id con el prefijo del tipo, comparado byte a byte (COLLATE "C") en el orden y en el cursor.
    const cursor = filtro.antesDe
      ? `WHERE e.ocurrido_en < :antesDeEn OR (e.ocurrido_en = :antesDeEn AND e.id COLLATE "C" < :antesDeId)`
      : '';
    const { rows }: { rows: FilaEvento[] } = await this.db.raw(
      `
      WITH fuentes (${COLUMNAS}) AS (${ramas.join('\n  UNION ALL\n')}),
      eventos AS (SELECT fuentes.*, (tipo || ':' || origen_id) AS id FROM fuentes)
      SELECT e.id, e.tipo, e.origen_id, e.ocurrido_en, e.actor_id, ua.nombre AS actor_nombre, ra.nombre AS actor_rol,
        (e.actor_id = t.solicitante_id) AS actor_es_solicitante, e.motivo, e.estado_anterior, e.estado_nuevo,
        e.tecnico_anterior_id, ta.nombre AS tecnico_anterior_nombre, e.tecnico_nuevo_id, tn.nombre AS tecnico_nuevo_nombre,
        dor.nombre AS dependencia_origen, dsu.nombre AS dependencia_sugerida, e.interno, e.nombre_adjunto
      FROM eventos e
      JOIN tickets t ON t.id = :ticketId
      LEFT JOIN usuarios ua ON ua.id = e.actor_id
      LEFT JOIN roles ra ON ra.id = ua.rol_id
      LEFT JOIN usuarios ta ON ta.id = e.tecnico_anterior_id
      LEFT JOIN usuarios tn ON tn.id = e.tecnico_nuevo_id
      LEFT JOIN dependencias dor ON dor.id = e.dependencia_origen_id
      LEFT JOIN dependencias dsu ON dsu.id = e.dependencia_sugerida_id
      ${cursor}
      ORDER BY e.ocurrido_en DESC, e.id COLLATE "C" DESC
      LIMIT :limite
      `,
      {
        ticketId,
        limite: filtro.limite,
        ...(filtro.antesDe ? { antesDeEn: filtro.antesDe.ocurridoEn, antesDeId: filtro.antesDe.id } : {}),
      },
    );
    return rows.map((fila) => ({
      id: fila.id,
      ocurridoEn: fila.ocurrido_en.toISOString(),
      actor: aActor(fila),
      detalle: aDetalle(fila),
    }));
  }
}
