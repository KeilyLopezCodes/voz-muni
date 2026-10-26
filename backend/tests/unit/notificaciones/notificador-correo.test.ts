import { NotificadorCorreo } from '../../../src/application/services/notificador-correo.service';
import { correosPendientes, EnviadorEnMemoria, PlantillasEnMemoria } from '../auth/dobles';
import { CorreosEnMemoria, notificadorDePrueba } from './dobles-correo';

const VENCE = new Date('2026-11-02T15:30:00.000Z');

function montar(despachoSincronico = true) {
  const correos = new CorreosEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const logs: string[] = [];
  const notificador = notificadorDePrueba(new PlantillasEnMemoria(), enviador, (m) => logs.push(m), {
    correos,
    despachoSincronico,
  });
  return { correos, enviador, logs, notificador };
}

describe('NotificadorCorreo', () => {
  it('encolar renderiza la plantilla y guarda el mensaje con sus metadatos, sin enviarlo', async () => {
    const { correos, enviador, notificador } = montar();
    const id = await notificador.encolar(
      'recuperacion_password',
      { nombre: 'Ana <b>', enlace: 'https://vozmuni.test/restablecer?token=t' },
      { para: 'ana@vozmuni.test', usuarioId: 7, expiraEn: VENCE },
    );
    expect(id).toBe(1);
    expect(correos.filas[0]).toMatchObject({
      plantillaClave: 'recuperacion_password',
      para: 'ana@vozmuni.test',
      asunto: 'Recupera',
      texto: 'Ana <b>: https://vozmuni.test/restablecer?token=t',
      // El html va escapado (SPEC 09).
      html: '<a href="https://vozmuni.test/restablecer?token=t">Ana &lt;b&gt;</a>',
      usuarioId: 7,
      ticketId: null,
      expiraEn: VENCE,
      estado: 'pendiente',
    });
    expect(enviador.enviados).toEqual([]);
  });

  it('encola en el repositorio de la transacción que recibe', async () => {
    const { correos, notificador } = montar();
    const deLaTransaccion = new CorreosEnMemoria();
    await notificador.encolar('password_cambiado', { nombre: 'Ana' }, { para: 'ana@vozmuni.test' }, deLaTransaccion);
    expect(deLaTransaccion.filas).toHaveLength(1);
    expect(correos.filas).toEqual([]);
  });

  it('una plantilla inexistente devuelve null y lo registra, sin lanzar', async () => {
    const { correos, logs, notificador } = montar();
    await expect(notificador.encolar('no_existe', {}, { para: 'ana@vozmuni.test', usuarioId: 7 })).resolves.toBeNull();
    expect(correos.filas).toEqual([]);
    expect(logs).toEqual([expect.stringContaining('no_existe')]);
  });

  it('una variable faltante devuelve null y lo registra, sin lanzar', async () => {
    const { logs, notificador } = montar();
    await expect(notificador.encolar('recuperacion_password', { nombre: 'Ana' }, { para: 'a@b.gt' })).resolves.toBeNull();
    expect(logs).toEqual([expect.stringContaining('recuperacion_password')]);
  });

  it('despachar envía los encolados e ignora los null', async () => {
    const { enviador, notificador } = montar();
    const id = await notificador.encolar('password_cambiado', { nombre: 'Ana' }, { para: 'ana@vozmuni.test' });
    await notificador.despachar([id, null]);
    expect(enviador.enviados).toHaveLength(1);
  });

  it('despacharYEsperar dice si el correo salió', async () => {
    const { enviador, notificador } = montar(false);
    const ok = await notificador.encolar('password_cambiado', { nombre: 'Ana' }, { para: 'ana@vozmuni.test' });
    expect(await notificador.despacharYEsperar([ok])).toBe(true);
    enviador.fallar = true;
    const falla = await notificador.encolar('password_cambiado', { nombre: 'Ana' }, { para: 'ana@vozmuni.test' });
    expect(await notificador.despacharYEsperar([falla])).toBe(false);
    expect(await notificador.despacharYEsperar([null])).toBe(false);
  });

  it('sin despacho sincrónico, despachar no espera el envío', async () => {
    const { enviador, notificador } = montar(false);
    let soltar: () => void = () => {};
    enviador.enviar = () => new Promise<void>((resolver) => (soltar = resolver));
    const id = await notificador.encolar('password_cambiado', { nombre: 'Ana' }, { para: 'ana@vozmuni.test' });
    await expect(notificador.despachar([id])).resolves.toBeUndefined();
    soltar();
    await correosPendientes();
  });

  it('un error del despacho (por ejemplo, sin base) queda en el log y no se propaga', async () => {
    const logs: string[] = [];
    const notificador = new NotificadorCorreo(
      new PlantillasEnMemoria(),
      new CorreosEnMemoria(),
      { despacharIds: async () => Promise.reject(new Error('sin base')) },
      { now: () => new Date() },
      (m) => logs.push(m),
      { despachoSincronico: true },
    );
    await expect(notificador.despachar([1])).resolves.toBeUndefined();
    expect(logs).toEqual([expect.stringContaining('sin base')]);
  });
});
