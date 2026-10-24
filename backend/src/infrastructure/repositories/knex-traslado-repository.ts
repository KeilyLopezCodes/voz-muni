import type { Knex } from 'knex';
import type { Rol } from '../../domain/auth/roles';
import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';
import type {
  NuevaSolicitudTraslado,
  Resolucion,
  SolicitudBloqueada,
  SolicitudTraslado,
  TrasladoRepository,
} from '../../domain/repositories/traslado-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { EstadoSolicitud } from '../../domain/traslado/solicitud-traslado';

const UNIQUE_VIOLATION = '23505';

// pg devuelve los bigint como string.
interface FilaSolicitud {
  id: string;
  estado: EstadoSolicitud;
  motivo: string;
  ticket_id: string;
  ticket_numero: string;
  ticket_titulo: string;
  ticket_estado: EstadoTicket;
  origen_id: string;
  origen_nombre: string;
  sugerida_id: string | null;
  sugerida_nombre: string | null;
  solicitante_id: string;
  solicitante_nombre: string;
  solicitante_rol: Rol;
  resolutor_id: string | null;
  resolutor_nombre: string | null;
  motivo_resolucion: string | null;
  creado_en: Date;
  resuelto_en: Date | null;
}

const COLUMNAS = [
  's.id',
  's.estado',
  's.motivo',
  't.id as ticket_id',
  't.numero as ticket_numero',
  't.titulo as ticket_titulo',
  't.estado as ticket_estado',
  'o.id as origen_id',
  'o.nombre as origen_nombre',
  'sg.id as sugerida_id',
  'sg.nombre as sugerida_nombre',
  'u.id as solicitante_id',
  'u.nombre as solicitante_nombre',
  'r.nombre as solicitante_rol',
  'res.id as resolutor_id',
  'res.nombre as resolutor_nombre',
  's.motivo_resolucion',
  's.creado_en',
  's.resuelto_en',
];

function aSolicitud(fila: FilaSolicitud): SolicitudTraslado {
  return {
    id: Number(fila.id),
    estado: fila.estado,
    motivo: fila.motivo,
    ticket: { id: Number(fila.ticket_id), numero: fila.ticket_numero, titulo: fila.ticket_titulo, estado: fila.ticket_estado },
    dependenciaOrigen: { id: Number(fila.origen_id), nombre: fila.origen_nombre },
    dependenciaSugerida:
      fila.sugerida_id === null ? null : { id: Number(fila.sugerida_id), nombre: fila.sugerida_nombre ?? '' },
    solicitadoPor: { id: Number(fila.solicitante_id), nombre: fila.solicitante_nombre, rol: fila.solicitante_rol },
    resueltoPor: fila.resolutor_id === null ? null : { id: Number(fila.resolutor_id), nombre: fila.resolutor_nombre ?? '' },
    motivoResolucion: fila.motivo_resolucion,
    creadoEn: fila.creado_en,
    resueltoEn: fila.resuelto_en,
  };
}

export class KnexTrasladoRepository implements TrasladoRepository {
  constructor(private readonly db: Knex) {}

  async crear(solicitud: NuevaSolicitudTraslado): Promise<number> {
    try {
      const [fila] = await this.db('solicitudes_traslado')
        .insert({
          ticket_id: solicitud.ticketId,
          solicitado_por: solicitud.solicitadoPor,
          dependencia_origen_id: solicitud.dependenciaOrigenId,
          dependencia_sugerida_id: solicitud.dependenciaSugeridaId,
          motivo: solicitud.motivo,
          ...(solicitud.resolucion
            ? {
                estado: solicitud.resolucion.estado,
                resuelto_por: solicitud.resolucion.resueltoPor,
                resuelto_en: solicitud.resolucion.resueltoEn,
              }
            : {}),
        })
        .returning('id');
      return Number(fila.id);
    } catch (error) {
      const { code, constraint } = (error ?? {}) as { code?: string; constraint?: string };
      if (code === UNIQUE_VIOLATION && constraint === 'solicitudes_traslado_una_pendiente') {
        throw new ReglaDeNegocioError('TRASLADO_PENDIENTE', 'La queja ya tiene una solicitud de traslado pendiente');
      }
      throw error;
    }
  }

  async obtenerParaActualizar(id: number): Promise<SolicitudBloqueada | null> {
    const fila:
      | { id: string; ticket_id: string; estado: EstadoSolicitud; motivo: string; solicitado_por: string }
      | undefined = await this.db('solicitudes_traslado')
      .where({ id })
      .forUpdate()
      .first('id', 'ticket_id', 'estado', 'motivo', 'solicitado_por');
    if (!fila) {
      return null;
    }
    return {
      id: Number(fila.id),
      ticketId: Number(fila.ticket_id),
      estado: fila.estado,
      motivo: fila.motivo,
      solicitadoPor: Number(fila.solicitado_por),
    };
  }

  async resolver(id: number, resolucion: Resolucion): Promise<void> {
    await this.db('solicitudes_traslado').where({ id }).update({
      estado: resolucion.estado,
      resuelto_por: resolucion.resueltoPor,
      motivo_resolucion: resolucion.motivoResolucion,
      resuelto_en: resolucion.resueltoEn,
    });
  }

  async obtener(id: number): Promise<SolicitudTraslado | null> {
    const fila: FilaSolicitud | undefined = await this.consulta().where('s.id', id).first(COLUMNAS);
    return fila ? aSolicitud(fila) : null;
  }

  async listar(estado: EstadoSolicitud, pagina: number, tamano: number): Promise<Pagina<SolicitudTraslado>> {
    const [{ total }] = await this.db('solicitudes_traslado').where({ estado }).count({ total: '*' });
    const filas: FilaSolicitud[] = await this.consulta()
      .where('s.estado', estado)
      .select(COLUMNAS)
      .orderBy([
        { column: 's.creado_en', order: 'asc' },
        { column: 's.id', order: 'asc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return { datos: filas.map(aSolicitud), pagina, tamano, total: Number(total) };
  }

  async dependenciaActiva(dependenciaId: number): Promise<boolean> {
    return (await this.db('dependencias').where({ id: dependenciaId, activa: true }).first('id')) !== undefined;
  }

  private consulta(): Knex.QueryBuilder {
    return this.db('solicitudes_traslado as s')
      .join('tickets as t', 't.id', 's.ticket_id')
      .join('dependencias as o', 'o.id', 's.dependencia_origen_id')
      .leftJoin('dependencias as sg', 'sg.id', 's.dependencia_sugerida_id')
      .join('usuarios as u', 'u.id', 's.solicitado_por')
      .join('roles as r', 'r.id', 'u.rol_id')
      .leftJoin('usuarios as res', 'res.id', 's.resuelto_por');
  }
}
