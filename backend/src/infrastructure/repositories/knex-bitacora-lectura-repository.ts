import type { Knex } from 'knex';
import type { FiltroBitacora } from '../../domain/autorizacion/alcance-bitacora';
import type { BitacoraLecturaRepository, FilaBitacora } from '../../domain/repositories/bitacora-lectura-repository';
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
}
