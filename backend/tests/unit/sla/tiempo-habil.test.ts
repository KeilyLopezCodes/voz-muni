import { minutosPorJornada, validarJornada } from '../../../src/domain/calendario/jornada';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../../src/domain/calendario/tiempo-habil';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import {
  alAceptar,
  alIniciar,
  alPonerEnEspera,
  alReabrir,
  alReanudar,
  type CalculadoraHabil,
} from '../../../src/domain/sla/vencimientos';
import { slaVacio } from '../../support/sla-vacio';

const jornada = { inicio: '08:00', fin: '16:00' };
// Semana del lunes 26 al viernes 30 de octubre de 2026 y la siguiente; el martes 3 de noviembre es asueto.
const dias = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-05'];
// Guatemala es UTC−6 todo el año: 15:00 local = 21:00Z.
const gt = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`);

describe('jornada', () => {
  it('08:00–16:00 tiene 480 minutos', () => {
    expect(minutosPorJornada(validarJornada(jornada))).toBe(480);
  });

  it.each([{ inicio: '16:00', fin: '08:00' }, { inicio: '8:00', fin: '16:00' }, { inicio: '08:00', fin: '25:00' }, null])(
    'rechaza %p',
    (valor) => {
      expect(() => validarJornada(valor)).toThrow(ReglaDeNegocioError);
    },
  );
});

describe('sumarMinutosHabiles', () => {
  it.each([
    [gt('2026-10-26', '15:00'), 120, gt('2026-10-27', '09:00')],
    [gt('2026-10-30', '18:00'), 60, gt('2026-11-02', '09:00')],
    [gt('2026-10-26', '08:00'), 480, gt('2026-10-26', '16:00')],
    [gt('2026-10-26', '06:30'), 30, gt('2026-10-26', '08:30')],
    [gt('2026-11-02', '15:00'), 120, gt('2026-11-04', '09:00')], // salta el asueto
    [gt('2026-10-26', '23:30'), 0, gt('2026-10-27', '08:00')], // fecha local, no UTC
  ])('%s + %i min = %s', (desde, minutos, esperado) => {
    expect(sumarMinutosHabiles(desde, minutos, dias, jornada)).toEqual(esperado);
  });

  it('sin días suficientes lanza CALENDARIO_INCOMPLETO', () => {
    expect(() => sumarMinutosHabiles(gt('2026-11-05', '08:00'), 600, dias, jornada)).toThrow(
      expect.objectContaining({ codigo: 'CALENDARIO_INCOMPLETO' }),
    );
  });
});

describe('minutosHabilesEntre', () => {
  it('de viernes 15:00 a lunes 09:00 son 120', () => {
    expect(minutosHabilesEntre(gt('2026-10-30', '15:00'), gt('2026-11-02', '09:00'), dias, jornada)).toBe(120);
  });

  it('de un instante a sí mismo es 0', () => {
    const t = gt('2026-10-27', '10:00');
    expect(minutosHabilesEntre(t, t, dias, jornada)).toBe(0);
  });
});

describe('reglas de vencimiento', () => {
  const calc: CalculadoraHabil = {
    sumar: async (desde, minutos) => sumarMinutosHabiles(desde, minutos, dias, jornada),
    entre: async (desde, hasta) => minutosHabilesEntre(desde, hasta, dias, jornada),
  };
  const plazo = { respuesta: 8 * 60, resolucion: 24 * 60 };
  const creadoEn = gt('2026-10-26', '08:00');

  it('aceptar calcula desde el registro, con la alerta al 80 %', async () => {
    const cambios = await alAceptar(slaVacio(creadoEn), plazo, 80, calc);
    expect(cambios.venceRespuesta).toEqual(gt('2026-10-26', '16:00'));
    expect(cambios.venceResolucion).toEqual(gt('2026-10-28', '16:00'));
    expect(cambios.alertaRespuestaEn).toEqual(gt('2026-10-26', '14:24'));
    expect(cambios.inicioResolucion).toEqual(creadoEn);
  });

  it('iniciar fija la primera respuesta solo la primera vez', () => {
    const ahora = gt('2026-10-26', '10:00');
    expect(alIniciar(slaVacio(creadoEn), ahora)).toEqual({ primeraRespuestaEn: ahora, alertaRespuestaEn: null });
    expect(alIniciar({ ...slaVacio(creadoEn), primeraRespuestaEn: ahora }, gt('2026-10-27', '10:00'))).toEqual({});
  });

  it('la pausa congela el restante y reanudar lo suma desde ahora', async () => {
    const estado = { ...slaVacio(creadoEn), ...(await alAceptar(slaVacio(creadoEn), plazo, 80, calc)) };
    const espera = await alPonerEnEspera(estado, gt('2026-10-27', '08:00'), calc);
    expect(espera).toMatchObject({ restanteMinutos: 960, venceResolucion: null, alertaResolucionEn: null });
    const pausado = { ...estado, ...espera };
    const reanudado = await alReanudar(pausado, gt('2026-10-27', '10:00'), plazo, 80, calc);
    expect(reanudado.pausaMinutos).toBe(120);
    expect(reanudado.venceResolucion).toEqual(gt('2026-10-29', '10:00'));
  });

  it('una pausa con el plazo vencido deja restante 0', async () => {
    const estado = { ...slaVacio(creadoEn), venceResolucion: gt('2026-10-26', '09:00') };
    expect(await alPonerEnEspera(estado, gt('2026-10-27', '08:00'), calc)).toMatchObject({ restanteMinutos: 0 });
  });

  it('reabrir reinicia la resolución con la pausa en 0', async () => {
    const ahora = gt('2026-10-27', '08:00');
    const cambios = await alReabrir(ahora, plazo, 80, calc);
    expect(cambios).toMatchObject({ inicioResolucion: ahora, pausaMinutos: 0, alertaResolucionEnviadaEn: null });
    expect(cambios.venceResolucion).toEqual(gt('2026-10-29', '16:00'));
    expect(cambios).not.toHaveProperty('venceRespuesta');
  });

  it('aceptar tras un traslado parte de inicioResolucion y suma la pausa', async () => {
    const estado = { ...slaVacio(creadoEn), pausaMinutos: 120, primeraRespuestaEn: gt('2026-10-26', '09:00') };
    const cambios = await alAceptar(estado, plazo, 80, calc);
    expect(cambios.venceResolucion).toEqual(gt('2026-10-29', '10:00'));
    expect(cambios.alertaRespuestaEn).toBeNull();
  });
});
