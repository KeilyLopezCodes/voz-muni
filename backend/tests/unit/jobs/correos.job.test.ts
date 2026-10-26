import { iniciarJobCorreos } from '../../../src/infrastructure/jobs/correos.job';
import type { Programador, RegistroJob } from '../../../src/infrastructure/jobs/sla.job';

const AHORA = new Date('2026-11-02T20:00:00.000Z');

// node-cron simulado: guarda la expresión y la tarea para dispararla a mano.
function iniciar(despacho: jest.Mock, avisos: jest.Mock = jest.fn().mockResolvedValue(0)) {
  const estado = { expresion: '', detenido: false, tarea: null as null | (() => Promise<void>) };
  const programar: Programador = (expresion, tarea) => {
    estado.expresion = expresion;
    estado.tarea = tarea;
    return { stop: () => void (estado.detenido = true) };
  };
  const lineas: string[] = [];
  const registro: RegistroJob = {
    info: (m) => lineas.push(`info: ${m}`),
    error: (m) => lineas.push(`error: ${m}`),
  };
  const detener = iniciarJobCorreos(
    { avisos: { procesar: avisos }, despacho: { procesar: despacho } },
    { cron: '* * * * *' },
    { now: () => AHORA },
    programar,
    registro,
  );
  return { estado, lineas, detener };
}

describe('iniciarJobCorreos', () => {
  it('programa con la expresión configurada y ejecuta los avisos y luego el despacho con el mismo ahora', async () => {
    const orden: string[] = [];
    const avisos = jest.fn(async (ahora: Date) => (orden.push(`avisos ${ahora.toISOString()}`), 2));
    const despacho = jest.fn(async (ahora: Date) => (orden.push(`despacho ${ahora.toISOString()}`), 3));
    const { estado, lineas } = iniciar(despacho, avisos);

    expect(estado.expresion).toBe('* * * * *');
    await estado.tarea!();

    expect(orden).toEqual([`avisos ${AHORA.toISOString()}`, `despacho ${AHORA.toISOString()}`]);
    expect(lineas).toEqual([
      'info: Job de correos programado con "* * * * *"',
      'info: Correos: 2 avisos de comentarios encolados',
      'info: Correos: 3 correos procesados',
    ]);
  });

  it('sin trabajo no escribe en el log', async () => {
    const { estado, lineas } = iniciar(jest.fn().mockResolvedValue(0));
    await estado.tarea!();
    expect(lineas).toHaveLength(1);
  });

  it('salta una corrida si la anterior sigue en curso', async () => {
    let soltar: (n: number) => void = () => {};
    const avisos = jest
      .fn()
      .mockImplementationOnce(() => new Promise<number>((resolver) => (soltar = resolver)))
      .mockResolvedValue(0);
    const despacho = jest.fn().mockResolvedValue(0);
    const { estado, lineas } = iniciar(despacho, avisos);

    const primera = estado.tarea!();
    await estado.tarea!();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('info: Correos: la corrida anterior sigue en curso, se salta esta');

    soltar(0);
    await primera;
    await estado.tarea!();
    expect(avisos).toHaveBeenCalledTimes(2);
    expect(despacho).toHaveBeenCalledTimes(2);
  });

  it('un error en los avisos no impide el despacho, y un error no detiene el job', async () => {
    const avisos = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(0);
    const despacho = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(1);
    const { estado, lineas } = iniciar(despacho, avisos);

    await estado.tarea!();
    await estado.tarea!();

    expect(despacho).toHaveBeenCalledTimes(2);
    expect(lineas).toEqual([
      'info: Job de correos programado con "* * * * *"',
      'error: Correos: falló el paso de avisos de comentarios',
      'error: Correos: falló el paso de despacho',
      'info: Correos: 1 correos procesados',
    ]);
  });

  it('la función devuelta detiene la tarea', () => {
    const { estado, detener } = iniciar(jest.fn());
    detener();
    expect(estado.detenido).toBe(true);
  });
});
