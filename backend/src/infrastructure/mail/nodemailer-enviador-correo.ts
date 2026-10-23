import nodemailer, { type Transporter } from 'nodemailer';
import type { EnviadorCorreo, MensajeCorreo } from '../../domain/notificaciones/enviador-correo';

export interface OpcionesSmtp {
  host: string;
  port: number;
  secure: boolean; // false = STARTTLS
  user: string;
  pass: string;
  from: string; // MAIL_FROM
}

const HOST_ETHEREAL = 'smtp.ethereal.email';

// Envío por SMTP. En desarrollo apunta a Ethereal, que no entrega el correo: lo muestra en su web.
export class NodemailerEnviadorCorreo implements EnviadorCorreo {
  private readonly transporte: Transporter;

  constructor(
    private readonly opciones: OpcionesSmtp,
    // Las pruebas inyectan un transporte que no sale a la red.
    transporte?: Transporter,
    private readonly log: (mensaje: string) => void = console.log,
  ) {
    this.transporte =
      transporte ??
      nodemailer.createTransport({
        host: opciones.host,
        port: opciones.port,
        secure: opciones.secure,
        auth: { user: opciones.user, pass: opciones.pass },
      });
  }

  async enviar({ para, asunto, texto, html }: MensajeCorreo): Promise<void> {
    const info = await this.transporte.sendMail({ from: this.opciones.from, to: para, subject: asunto, text: texto, html });

    if (this.opciones.host === HOST_ETHEREAL) {
      const vistaPrevia = nodemailer.getTestMessageUrl(info);
      if (vistaPrevia) {
        this.log(`Correo de desarrollo para ${para}: vista previa en ${vistaPrevia}`);
      }
    }
  }
}
