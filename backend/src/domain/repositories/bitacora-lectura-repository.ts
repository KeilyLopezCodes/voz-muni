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

// Lectura de la bitácora filtrada por el alcance de bitacora.ver (SPEC 11).
export interface BitacoraLecturaRepository {
  // Ordenado por creado_en DESC y luego id DESC.
  listar(filtro: FiltroBitacora, pagina: number, tamano: number): Promise<Pagina<FilaBitacora>>;
}
