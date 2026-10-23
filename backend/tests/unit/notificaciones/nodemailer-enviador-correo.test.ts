import nodemailer, { type Transporter } from 'nodemailer';
import { NodemailerEnviadorCorreo, type OpcionesSmtp } from '../../../src/infrastructure/mail/nodemailer-enviador-correo';

const opciones: OpcionesSmtp = {
  host: 'smtp.municipalidad.test',
  port: 587,
  secure: false,
  user: 'usuario',
  pass: 'clave',
  from: 'VozMuni <no-responder@vozmuni.test>',
};

const mensaje = {
  para: 'ana@vozmuni.test',
  asunto: 'VozMuni: restablece tu contraseña',
  texto: 'Hola Ana',
  html: '<p>Hola Ana</p>',
};

// Transporte que responde como Ethereal, sin salir a la red.
function transporteComoEthereal(): Transporter {
  return nodemailer.createTransport({
    name: 'ethereal-falso',
    version: '1',
    send: (mail: { message: { getEnvelope(): unknown; messageId(): string } }, callback: (error: Error | null, info: unknown) => void) => {
      callback(null, {
        envelope: mail.message.getEnvelope(),
        messageId: mail.message.messageId(),
        response: '250 Accepted [STATUS=new MSGID=abc123]',
      });
    },
  } as unknown as Parameters<typeof nodemailer.createTransport>[0]);
}

describe('NodemailerEnviadorCorreo', () => {
  it('envía from, to, subject, text y html', async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = jest.spyOn(transporte, 'sendMail');
    const log = jest.fn();

    await new NodemailerEnviadorCorreo(opciones, transporte, log).enviar(mensaje);

    const info = (await sendMail.mock.results[0].value) as { message: string };
    expect(JSON.parse(info.message)).toMatchObject({
      from: { address: 'no-responder@vozmuni.test', name: 'VozMuni' },
      to: [{ address: 'ana@vozmuni.test', name: '' }],
      subject: 'VozMuni: restablece tu contraseña',
      text: 'Hola Ana',
      html: '<p>Hola Ana</p>',
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('con host smtp.ethereal.email registra el enlace de vista previa', async () => {
    const log = jest.fn();

    await new NodemailerEnviadorCorreo({ ...opciones, host: 'smtp.ethereal.email' }, transporteComoEthereal(), log).enviar(
      mensaje,
    );

    expect(log).toHaveBeenCalledWith(expect.stringContaining('https://ethereal.email/message/abc123'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ana@vozmuni.test'));
  });

  it('con otro host no registra vista previa aunque la respuesta la traiga', async () => {
    const log = jest.fn();

    await new NodemailerEnviadorCorreo(opciones, transporteComoEthereal(), log).enviar(mensaje);

    expect(log).not.toHaveBeenCalled();
  });

  it('propaga el error si el SMTP falla', async () => {
    const transporte = {
      sendMail: async () => {
        throw new Error('ECONNREFUSED');
      },
    } as unknown as Transporter;

    await expect(new NodemailerEnviadorCorreo(opciones, transporte, jest.fn()).enviar(mensaje)).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});
