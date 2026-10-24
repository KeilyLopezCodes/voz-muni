export interface NuevoCorreo {
  plantillaClave: string;
  para: string;
  asunto: string;
  texto: string;
  html: string;
  ticketId: number | null;
  usuarioId: number | null;
  expiraEn: Date | null; // vencimiento del token del enlace, si lleva uno
}

export interface CorreoReclamado extends NuevoCorreo {
  id: number;
  intentos: number; // intentos ya hechos antes de este
}

// Bandeja de salida (SPEC 34). El cuerpo, que puede llevar tokens y datos personales, solo existe mientras el
// correo está pendiente: al terminar quedan los metadatos.
export interface CorreoSalienteRepository {
  insertar(correo: NuevoCorreo, ahora: Date): Promise<number>;
  // Reserva de forma atómica (FOR UPDATE SKIP LOCKED) hasta `limite` pendientes con proximo_intento_en <= ahora,
  // corriendo su próximo intento para que otra corrida no los tome mientras se envían.
  reclamarVencidos(ahora: Date, limite: number): Promise<CorreoReclamado[]>;
  marcarEnviado(id: number, ahora: Date): Promise<void>;
  marcarDescartado(id: number, ahora: Date): Promise<void>;
  // proximo = null → 'fallido'. Suma un intento.
  registrarFallo(id: number, error: string, proximo: Date | null, ahora: Date): Promise<void>;
}
