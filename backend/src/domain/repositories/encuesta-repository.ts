// Encuestas de satisfacción (RF-37, SPEC 39): una por queja (encuestas.ticket_id UNIQUE, SPEC 03). Se usa dentro de
// una Transaccion.
export interface Encuesta {
  calificacion: number;
  comentario: string | null;
  creadoEn: Date;
}

export interface EncuestaRepository {
  obtener(ticketId: number): Promise<Encuesta | null>;
  // Si la queja ya tiene encuesta, lanza ReglaDeNegocioError ENCUESTA_EXISTENTE (el UNIQUE decide).
  crear(ticketId: number, encuesta: Encuesta): Promise<void>;
}
