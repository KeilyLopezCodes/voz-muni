import type { Rol } from '../auth/roles';

export interface NuevoComentario {
  ticketId: number;
  autorId: number;
  cuerpo: string;
  interno: boolean;
  creadoEn: Date;
}

export interface ComentarioLeido {
  id: number;
  cuerpo: string;
  interno: boolean;
  autor: { id: number; nombre: string; rol: Rol };
  esDelSolicitante: boolean;
  creadoEn: Date;
  editadoEn: Date | null;
}

// Lo que hace falta para decidir si el autor puede editar.
export interface ComentarioEditable {
  id: number;
  interno: boolean;
  creadoEn: Date;
}

export const MAX_COMENTARIOS_HILO = 500;

// Comentarios del ticket (SPEC 23). Se usa dentro de una Transaccion.
export interface ComentarioRepository {
  crear(comentario: NuevoComentario): Promise<number>;
  // Los últimos MAX_COMENTARIOS_HILO en orden creado_en ASC, id ASC. Sin `incluirInternos` las notas internas se
  // excluyen en la consulta (WHERE es_interno = false), nunca después en memoria (RNF-12).
  listar(ticketId: number, incluirInternos: boolean): Promise<ComentarioLeido[]>;
  obtener(id: number): Promise<ComentarioLeido | null>;
  // FOR UPDATE. null si no existe, si es de otro ticket o si su autor no es `autorId`.
  obtenerDelAutor(ticketId: number, comentarioId: number, autorId: number): Promise<ComentarioEditable | null>;
  editar(id: number, cuerpo: string, editadoEn: Date): Promise<void>;
}
