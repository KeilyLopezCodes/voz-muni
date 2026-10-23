import type { Knex } from 'knex';
import type { CampoBitacora } from '../../domain/autorizacion/alcance-bitacora';
import type { CampoTicket } from '../../domain/autorizacion/alcance-tickets';
import type { Condicion } from '../../domain/autorizacion/filtro';

// Mapas fijos de campo del dominio → columna (RNF-10): ningún nombre de columna sale de la entrada del usuario.
export const COLUMNAS_TICKET: Readonly<Record<CampoTicket, string>> = {
  solicitanteId: 'solicitante_id',
  registradoPor: 'registrado_por',
  asignadoA: 'asignado_a',
  dependenciaId: 'dependencia_id',
};

export const COLUMNAS_BITACORA: Readonly<Record<CampoBitacora, string>> = {
  dependenciaId: 'dependencia_id',
};

// Agrega `columna = ?` por cada condición. Una lista vacía no agrega WHERE.
// El filtro null lo corta el repositorio antes de llegar aquí, sin consultar la base.
export function aplicarFiltro<C extends string>(
  consulta: Knex.QueryBuilder,
  condiciones: readonly Condicion<C>[],
  columnas: Readonly<Record<C, string>>,
  tabla: string,
): Knex.QueryBuilder {
  for (const { campo, valor } of condiciones) {
    consulta.where(`${tabla}.${columnas[campo]}`, valor);
  }
  return consulta;
}
