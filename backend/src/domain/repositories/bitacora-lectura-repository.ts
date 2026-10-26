import type { AccionBitacora } from '../auditoria/acciones';
import type { DetalleBitacora } from '../auditoria/saneamiento';
import type { Rol } from '../auth/roles';
import type { FiltroBitacora } from '../autorizacion/alcance-bitacora';
import type { Pagina } from './ticket-lectura-repository';

export interface FilaBitacora {
  id: number;
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  dependenciaId: number | null;
  creadoEn: Date;
}

// Los filtros de GET /api/v1/bitacora (SPEC 41), ya validados.
export interface CriteriosBitacora {
  desde: Date; // incluido
  hasta: Date; // excluido
  acciones: readonly AccionBitacora[]; // vacío: todas
  entidad: string | null;
  usuarioId: number | null;
  numero: string | null; // número de queja: entidad = 'ticket' y su id
  cursor: { creadoEn: Date; id: number } | null; // el último de la página anterior
  limite: number;
}

// Un registro con lo que la pantalla muestra.
export interface RegistroBitacora {
  id: number;
  creadoEn: Date; // truncado a milisegundos, la precisión del cursor
  accion: AccionBitacora;
  entidad: string;
  entidadId: string | null;
  ticketNumero: string | null; // si la entidad es una queja o su encuesta
  usuario: { id: number; nombre: string; rol: Rol } | null; // null = sistema
  dependencia: { id: number; nombre: string } | null;
  ip: string | null;
  detalle: DetalleBitacora;
}

// Lectura de la bitácora filtrada por el alcance de bitacora.ver (SPEC 11). Un filtro null no consulta la base.
export interface BitacoraLecturaRepository {
  // Ordenado por creado_en DESC y luego id DESC.
  listar(filtro: FiltroBitacora, pagina: number, tamano: number): Promise<Pagina<FilaBitacora>>;
  // creado_en DESC, id DESC, después del cursor (SPEC 41).
  consultar(filtro: FiltroBitacora, criterios: CriteriosBitacora): Promise<RegistroBitacora[]>;
}
