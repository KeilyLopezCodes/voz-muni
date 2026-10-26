import type { JornadaLaboral } from '../../../src/domain/calendario/jornada';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../../src/domain/calendario/tiempo-habil';
import {
  alAceptar,
  alIniciar,
  alPonerEnEspera,
  alReabrir,
  alReanudar,
  type EstadoSla,
  type RelojHabil,
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

const PLAZO = { horasRespuesta: 8, horasResolucion: 48 };

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
    ...cambios,
  };
}

describe('vencimientos', () => {
  it('aceptar calcula los dos vencimientos desde creadoEn', async () => {
    expect(await alAceptar(estado(), PLAZO, RELOJ)).toEqual({
      inicioResolucion: gt('2026-10-26', '10:00'),
      venceRespuesta: gt('2026-10-27', '10:00'),
      venceResolucion: gt('2026-11-03', '10:00'),
    });
  });

  it('aceptar de nuevo tras un traslado parte de inicioResolucion y suma la pausa acumulada', async () => {
    const trasladada = estado({ inicioResolucion: gt('2026-11-02', '09:00'), pausaMinutos: 120 });
    expect(await alAceptar(trasladada, { horasRespuesta: 2, horasResolucion: 24 }, RELOJ)).toEqual({
      inicioResolucion: gt('2026-11-02', '09:00'),
      venceRespuesta: gt('2026-10-26', '12:00'),
      venceResolucion: gt('2026-11-05', '11:00'),
    });
  });

  it('iniciar fija primeraRespuestaEn solo la primera vez', () => {
    const ahora = gt('2026-10-26', '11:00');
    expect(alIniciar(estado(), ahora)).toEqual({ primeraRespuestaEn: ahora });
    expect(alIniciar(estado({ primeraRespuestaEn: gt('2026-10-26', '10:30') }), ahora)).toEqual({});
  });

  it('poner en espera congela el restante y deja venceResolucion en null', async () => {
    const ahora = gt('2026-11-02', '10:00');
    expect(await alPonerEnEspera(estado({ venceResolucion: gt('2026-11-03', '10:00') }), ahora, RELOJ)).toEqual({
      restanteMinutos: 480,
      pausadoDesde: ahora,
      venceResolucion: null,
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
    expect(await alReanudar(estado(), gt('2026-11-02', '10:00'), RELOJ)).toEqual({});
  });

  it('reanudar suma la pausa y recalcula desde ahora con el restante', async () => {
    const pausada = estado({ pausaMinutos: 30, pausadoDesde: gt('2026-11-02', '10:00'), restanteMinutos: 480 });
    expect(await alReanudar(pausada, gt('2026-11-02', '12:00'), RELOJ)).toEqual({
      pausaMinutos: 150,
      venceResolucion: gt('2026-11-03', '12:00'),
      pausadoDesde: null,
      restanteMinutos: null,
    });
  });

  it('reabrir reinicia desde ahora con la pausa en 0 y conserva la primera respuesta', async () => {
    const ahora = gt('2026-11-09', '09:00');
    const cambios = await alReabrir(
      estado({ pausaMinutos: 200, primeraRespuestaEn: gt('2026-10-26', '11:00'), venceRespuesta: gt('2026-10-27', '10:00') }),
      PLAZO,
      ahora,
      RELOJ,
    );
    expect(cambios).toEqual({ inicioResolucion: ahora, pausaMinutos: 0, venceResolucion: gt('2026-11-17', '09:00') });
    expect(cambios).not.toHaveProperty('primeraRespuestaEn');
    expect(cambios).not.toHaveProperty('venceRespuesta');
  });
});
