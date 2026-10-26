import type { Knex } from 'knex';
import type { FiltroBitacora } from '../../domain/autorizacion/alcance-bitacora';
import type { AccionBitacora } from '../../domain/auditoria/acciones';
import type { DetalleBitacora } from '../../domain/auditoria/saneamiento';
import type { Rol } from '../../domain/auth/roles';
import type {
  BitacoraLecturaRepository,
  CriteriosBitacora,
  FilaBitacora,
  RegistroBitacora,
} from '../../domain/repositories/bitacora-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import { aplicarFiltro, COLUMNAS_BITACORA } from './knex-filtro';

// pg devuelve los bigint como string.
interface Fila {
  id: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  dependencia_id: string | null;
  creado_en: Date;
}

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

interface FilaRegistro {
  id: string;
  creado_en: Date;
  accion: AccionBitacora;
  entidad: string;
  entidad_id: string | null;
  ip: string | null;
  detalle: DetalleBitacora;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_rol: Rol | null;
  dependencia_id: string | null;
  dependencia_nombre: string | null;
  ticket_numero: string | null;
}

// El instante con la precisión del cursor (un Date de JavaScript): así una página no repite ni salta registros
// creados en el mismo milisegundo, como la línea de tiempo (SPEC 28).
const CREADO_EN = "date_trunc('milliseconds', b.creado_en)";

// La queja de un registro de queja o de su encuesta (su entidad_id es el id de la queja).
// El ticket de cada registro: su entidad_id en las quejas y encuestas, y detalle.datos.ticketId en los comentarios y
// adjuntos (SPEC 42). Los CASE evitan convertir un texto que no es un número.
const TICKET_DE_COMENTARIO = `(b.detalle -> 'datos' ->> 'ticketId')`;
const UNION_TICKET = `t.id = (CASE
  WHEN b.entidad IN ('ticket', 'encuesta') AND b.entidad_id ~ '^[0-9]+$' THEN b.entidad_id::bigint
  WHEN b.entidad IN ('comentario', 'adjunto') AND ${TICKET_DE_COMENTARIO} ~ '^[0-9]+$' THEN ${TICKET_DE_COMENTARIO}::bigint
END)`;
const ID_POR_NUMERO = '(SELECT id::text FROM tickets WHERE numero = ?)';

export class KnexBitacoraLecturaRepository implements BitacoraLecturaRepository {
  constructor(private readonly db: Knex) {}

  async listar(filtro: FiltroBitacora, pagina: number, tamano: number): Promise<Pagina<FilaBitacora>> {
    if (filtro === null) {
      return { datos: [], pagina, tamano, total: 0 };
    }
    const consulta = aplicarFiltro(this.db('bitacora as b'), filtro, COLUMNAS_BITACORA, 'b');
    const [{ total }] = await consulta.clone().count({ total: '*' });
    const filas: Fila[] = await consulta
      .select('b.id', 'b.usuario_id', 'b.accion', 'b.entidad', 'b.entidad_id', 'b.dependencia_id', 'b.creado_en')
      .orderBy([
        { column: 'b.creado_en', order: 'desc' },
        { column: 'b.id', order: 'desc' },
      ])
      .limit(tamano)
      .offset((pagina - 1) * tamano);
    return {
      datos: filas.map((fila) => ({
        id: Number(fila.id),
        usuarioId: numeroONull(fila.usuario_id),
        accion: fila.accion,
        entidad: fila.entidad,
        entidadId: fila.entidad_id,
        dependenciaId: numeroONull(fila.dependencia_id),
        creadoEn: fila.creado_en,
      })),
      pagina,
      tamano,
      total: Number(total),
    };
  }

  async consultar(filtro: FiltroBitacora, criterios: CriteriosBitacora): Promise<RegistroBitacora[]> {
    if (filtro === null) {
      return [];
    }
    const consulta = aplicarFiltro(this.db('bitacora as b'), filtro, COLUMNAS_BITACORA, 'b')
      .leftJoin('usuarios as u', 'u.id', 'b.usuario_id')
      .leftJoin('roles as r', 'r.id', 'u.rol_id')
      .leftJoin('dependencias as d', 'd.id', 'b.dependencia_id')
      .leftJoin('tickets as t', this.db.raw(UNION_TICKET))
      .where('b.creado_en', '>=', criterios.desde)
      .where('b.creado_en', '<', criterios.hasta);
    if (criterios.acciones.length > 0) {
      consulta.whereIn('b.accion', [...criterios.acciones]);
    }
    if (criterios.entidad !== null) {
      consulta.where('b.entidad', criterios.entidad);
    }
    if (criterios.usuarioId !== null) {
      consulta.where('b.usuario_id', criterios.usuarioId);
    }
    if (criterios.numero !== null) {
      // Todo lo que pasó en la queja: sus acciones y las de sus comentarios y adjuntos (SPEC 42). La comparación
      // con el texto usa el índice de expresión bitacora_ticket_datos_idx (0035).
      const numero = criterios.numero;
      consulta.where((o) =>
        o
          .where((q) => q.where('b.entidad', 'ticket').whereRaw(`b.entidad_id = ${ID_POR_NUMERO}`, [numero]))
          .orWhere((q) =>
            q.whereIn('b.entidad', ['comentario', 'adjunto']).whereRaw(`${TICKET_DE_COMENTARIO} = ${ID_POR_NUMERO}`, [numero]),
          ),
      );
    }
    if (criterios.cursor !== null) {
      consulta.whereRaw(`(${CREADO_EN}, b.id) < (?, ?)`, [criterios.cursor.creadoEn, criterios.cursor.id]);
    }
    const filas: FilaRegistro[] = await consulta
      .orderByRaw(`${CREADO_EN} DESC, b.id DESC`)
      .limit(criterios.limite)
      .select(
        'b.id',
        this.db.raw(`${CREADO_EN} as creado_en`),
        'b.accion',
        'b.entidad',
        'b.entidad_id',
        this.db.raw('host(b.ip) as ip'),
        'b.detalle',
        'u.id as usuario_id',
        'u.nombre as usuario_nombre',
        'r.nombre as usuario_rol',
        'd.id as dependencia_id',
        'd.nombre as dependencia_nombre',
        't.numero as ticket_numero',
      );
    return filas.map((f) => ({
      id: Number(f.id),
      creadoEn: f.creado_en,
      accion: f.accion,
      entidad: f.entidad,
      entidadId: f.entidad_id,
      ticketNumero: f.ticket_numero,
      usuario: f.usuario_id === null ? null : { id: Number(f.usuario_id), nombre: f.usuario_nombre!, rol: f.usuario_rol! },
      dependencia: f.dependencia_id === null ? null : { id: Number(f.dependencia_id), nombre: f.dependencia_nombre! },
      ip: f.ip,
      detalle: f.detalle,
    }));
  }
}
