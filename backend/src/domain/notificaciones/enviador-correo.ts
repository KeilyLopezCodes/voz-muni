export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

// Puerto: la infraestructura envía por SMTP con Nodemailer; las pruebas guardan los mensajes en memoria.
export interface EnviadorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}
