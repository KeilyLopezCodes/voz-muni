import type { JornadaLaboral } from '../../../src/domain/calendario/jornada';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../../src/domain/calendario/tiempo-habil';
import {
  alAceptar,
  alIniciar,
  alPonerEnEspera,
  alReabrir,
  alReanudar,
  alResolver,
  type EstadoSla,
  type PlazoHoras,
  type RelojHabil,
  validarUmbralAlerta,
} from '../../../src/domain/sla/vencimientos';

const JORNADA: JornadaLaboral = { inicio: '08:00', fin: '16:00' };
const DIAS = [
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
  '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
  '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
  '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
];
const RELOJ: RelojHabil = {
  sumar: async (desde, minutos) => sumarMinutosHabiles(desde, minutos, DIAS, JORNADA),
  entre: async (desde, hasta) => minutosHabilesEntre(desde, hasta, DIAS, JORNADA),
};

// Guatemala está en UTC−6 todo el año. Solo para armar los datos de prueba.
function gt(fecha: string, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const base = new Date(`${fecha}T00:00:00.000Z`).getTime();
  return new Date(base + ((h + 6) * 60 + m) * 60_000);
}

// 8 h de respuesta y 48 h de resolución, con la alerta al 80 %.
const PLAZO: PlazoHoras = { horasRespuesta: 8, horasResolucion: 48, umbralAlerta: 80 };

function estado(cambios: Partial<EstadoSla> = {}): EstadoSla {
  return {
    creadoEn: gt('2026-10-26', '10:00'),
    venceRespuesta: null,
    venceResolucion: null,
    primeraRespuestaEn: null,
    inicioResolucion: null,
    pausaMinutos: 0,
    pausadoDesde: null,
    restanteMinutos: null,
    alertaRespuestaEn: null,
    alertaResolucionEn: null,
    alertaRespuestaEnviadaEn: null,
    alertaResolucionEnviadaEn: null,
    ...cambios,
  };
}

describe('vencimientos', () => {
  it('aceptar calcula los dos vencimientos y sus alertas desde creadoEn, y reinicia las marcas', async () => {
    const enviadas = estado({ alertaRespuestaEnviadaEn: gt('2026-10-26', '11:00'), alertaResolucionEnviadaEn: gt('2026-10-26', '11:00') });
    expect(await alAceptar(enviadas, PLAZO, RELOJ)).toEqual({
      inicioResolucion: gt('2026-10-26', '10:00'),
      venceRespuesta: gt('2026-10-27', '10:00'),
      venceResolucion: gt('2026-11-03', '10:00'),
      // 80 % de 480 min = 384 min; de 2880 min = 2304 min.
      alertaRespuestaEn: gt('2026-10-27', '08:24'),
      alertaResolucionEn: gt('2026-11-02', '08:24'),
      alertaRespuestaEnviadaEn: null,
      alertaResolucionEnviadaEn: null,
    });
  });

  it('con u = 80, un plazo de respuesta de 8 h hábiles alerta a las 6 h 24 min hábiles del registro', async () => {
    const cambios = await alAceptar(estado({ creadoEn: gt('2026-10-26', '08:00') }), PLAZO, RELOJ);
    expect(cambios.alertaRespuestaEn).toEqual(gt('2026-10-26', '14:24'));
  });

  it('un umbral ya pasado queda en el pasado: el job lo envía en su siguiente corrida', async () => {
    const urgente: PlazoHoras = { horasRespuesta: 2, horasResolucion: 24, umbralAlerta: 80 };
    const cambios = await alAceptar(estado({ creadoEn: gt('2026-10-26', '08:00') }), urgente, RELOJ);
    expect(cambios.alertaRespuestaEn).toEqual(gt('2026-10-26', '09:36'));
  });

  it('aceptar de nuevo tras un traslado parte de inicioResolucion, suma la pausa y no alerta una respuesta ya dada', async () => {
    const trasladada = estado({ inicioResolucion: gt('2026-11-02', '09:00'), pausaMinutos: 120 });
    const plazo: PlazoHoras = { horasRespuesta: 2, horasResolucion: 24, umbralAlerta: 80 };
    expect(await alAceptar(trasladada, plazo, RELOJ)).toEqual({
      inicioResolucion: gt('2026-11-02', '09:00'),
      venceRespuesta: gt('2026-10-26', '12:00'),
      venceResolucion: gt('2026-11-05', '11:00'),
      alertaRespuestaEn: gt('2026-10-26', '11:36'),
      // 80 % de 1440 min = 1152 min, más los 120 de pausa.
      alertaResolucionEn: gt('2026-11-04', '14:12'),
      alertaRespuestaEnviadaEn: null,
      alertaResolucionEnviadaEn: null,
    });
    const respondida = await alAceptar({ ...trasladada, primeraRespuestaEn: gt('2026-10-26', '11:00') }, plazo, RELOJ);
    expect(respondida.alertaRespuestaEn).toBeNull();
  });

  it('iniciar fija primeraRespuestaEn y los minutos de respuesta solo la primera vez, y deja alertaRespuestaEn en null', async () => {
    const ahora = gt('2026-10-26', '11:00');
    expect(await alIniciar(estado({ alertaRespuestaEn: gt('2026-10-26', '16:24') }), ahora, RELOJ)).toEqual({
      primeraRespuestaEn: ahora,
      alertaRespuestaEn: null,
      minutosRespuesta: 60,
    });
    expect(await alIniciar(estado({ primeraRespuestaEn: gt('2026-10-26', '10:30') }), ahora, RELOJ)).toEqual({
      alertaRespuestaEn: null,
    });
  });

  it('resolver mide el ciclo desde inicioResolucion sin la pausa (mínimo 0); sin inicio no mide', async () => {
    const resueltoEn = gt('2026-10-27', '10:00'); // 6 h el lunes desde las 10:00 y 2 h el martes = 480
    expect(await alResolver(estado({ inicioResolucion: gt('2026-10-26', '10:00'), pausaMinutos: 60 }), resueltoEn, RELOJ)).toEqual({
      minutosResolucion: 420,
    });
    expect(await alResolver(estado({ inicioResolucion: gt('2026-10-27', '09:00'), pausaMinutos: 500 }), resueltoEn, RELOJ)).toEqual({
      minutosResolucion: 0,
    });
    expect(await alResolver(estado(), resueltoEn, RELOJ)).toEqual({});
  });

  it('poner en espera congela el restante y deja venceResolucion y alertaResolucionEn en null', async () => {
    const ahora = gt('2026-11-02', '10:00');
    const enPlazo = estado({ venceResolucion: gt('2026-11-03', '10:00'), alertaResolucionEn: gt('2026-11-02', '08:24') });
    expect(await alPonerEnEspera(enPlazo, ahora, RELOJ)).toEqual({
      restanteMinutos: 480,
      pausadoDesde: ahora,
      venceResolucion: null,
      alertaResolucionEn: null,
    });
  });

  it('poner en espera una queja ya vencida congela 0', async () => {
    const ahora = gt('2026-11-04', '10:00');
    expect(await alPonerEnEspera(estado({ venceResolucion: gt('2026-11-03', '10:00') }), ahora, RELOJ)).toMatchObject({
      restanteMinutos: 0,
    });
  });

  it('sin vencimiento (queja anterior a SPEC 30) no pausa ni reanuda nada', async () => {
    expect(await alPonerEnEspera(estado(), gt('2026-11-02', '10:00'), RELOJ)).toEqual({});
    expect(await alReanudar(estado(), PLAZO, gt('2026-11-02', '10:00'), RELOJ)).toEqual({});
  });

  it('reanudar con un restante menor que el 20 % alerta en ahora, y no reinicia la marca', async () => {
    const pausada = estado({
      pausaMinutos: 30,
      pausadoDesde: gt('2026-11-02', '10:00'),
      restanteMinutos: 480,
      alertaResolucionEnviadaEn: gt('2026-11-02', '09:00'),
    });
    const ahora = gt('2026-11-02', '12:00');
    const cambios = await alReanudar(pausada, PLAZO, ahora, RELOJ);
    expect(cambios).toEqual({
      pausaMinutos: 150,
      venceResolucion: gt('2026-11-03', '12:00'),
      alertaResolucionEn: ahora,
      pausadoDesde: null,
      restanteMinutos: null,
    });
    expect(cambios).not.toHaveProperty('alertaResolucionEnviadaEn');
  });

  it('reanudar con un restante mayor que el 20 % alerta a restante − antes(T) desde ahora', async () => {
    // T = 2880 min; antes(T) = 576 min. Con 1000 min de restante, la alerta queda a 424 min.
    const pausada = estado({ pausadoDesde: gt('2026-11-02', '10:00'), restanteMinutos: 1000 });
    expect(await alReanudar(pausada, PLAZO, gt('2026-11-02', '12:00'), RELOJ)).toMatchObject({
      venceResolucion: gt('2026-11-04', '12:40'),
      alertaResolucionEn: gt('2026-11-03', '11:04'),
    });
  });

  it('reabrir reinicia la resolución y su alerta desde ahora, con la marca en null, y conserva la primera respuesta', async () => {
    const ahora = gt('2026-11-09', '09:00');
    const cambios = await alReabrir(
      estado({
        pausaMinutos: 200,
        primeraRespuestaEn: gt('2026-10-26', '11:00'),
        venceRespuesta: gt('2026-10-27', '10:00'),
        alertaResolucionEnviadaEn: gt('2026-11-02', '08:30'),
      }),
      PLAZO,
      ahora,
      RELOJ,
    );
    expect(cambios).toEqual({
      inicioResolucion: ahora,
      pausaMinutos: 0,
      venceResolucion: gt('2026-11-17', '09:00'),
      alertaResolucionEn: gt('2026-11-13', '15:24'),
      alertaResolucionEnviadaEn: null,
      minutosResolucion: null,
    });
    expect(cambios).not.toHaveProperty('primeraRespuestaEn');
    expect(cambios).not.toHaveProperty('venceRespuesta');
    expect(cambios).not.toHaveProperty('alertaRespuestaEnviadaEn');
  });
});

describe('validarUmbralAlerta', () => {
  it.each([1, 80, 99])('%s es válido', (valor) => {
    expect(validarUmbralAlerta(valor)).toBe(valor);
  });

  it.each([0, 100, 80.5, '80', null])('%s → PARAMETRO_INVALIDO', (valor) => {
    expect(() => validarUmbralAlerta(valor)).toThrow(expect.objectContaining({ codigo: 'PARAMETRO_INVALIDO' }));
  });
});
