// Bandeja de salida de correos (RF-31, SPEC 34). Se usa dentro de una Transaccion: encolar en la del caso de uso,
// reclamar y registrar el resultado en la del despacho.

export interface NuevoCorreo {
  plantillaClave: string;
  para: string;
  asunto: string;
  texto: string;
  html: string;
  ticketId: number | null;
  usuarioId: number | null; // el destinatario, si es un usuario
  expiraEn: Date | null; // el vencimiento del token del enlace, si lleva uno
}

export interface CorreoReclamado extends NuevoCorreo {
  id: number;
  intentos: number; // los ya hechos
}

export interface CorreoSalienteRepository {
  insertar(correo: NuevoCorreo): Promise<number>;
  // SELECT … FOR UPDATE SKIP LOCKED: los ids pedidos que sigan pendientes (para el envío inmediato).
  reclamarPorId(ids: readonly number[]): Promise<CorreoReclamado[]>;
  // SELECT … FOR UPDATE SKIP LOCKED: pendientes con proximo_intento_en <= ahora, hasta `limite`.
  reclamarVencidos(ahora: Date, limite: number): Promise<CorreoReclamado[]>;
  // Enviar y fallar suman un intento; descartar no envía, así que no suma. Al terminar el correo (enviado,
  // descartado o fallido) borran texto y html.
  marcarEnviado(id: number, ahora: Date): Promise<void>;
  marcarDescartado(id: number, ahora: Date): Promise<void>;
  // proximo = null → 'fallido'.
  registrarFallo(id: number, error: string, proximo: Date | null, ahora: Date): Promise<void>;
}
