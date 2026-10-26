import { iniciarJobCorreos } from '../../../src/infrastructure/jobs/correos.job';
import type { Programador, RegistroJob } from '../../../src/infrastructure/jobs/sla.job';

const AHORA = new Date('2026-11-02T20:00:00.000Z');

// node-cron simulado: guarda la expresión y la tarea para dispararla a mano.
function iniciar(procesar: jest.Mock) {
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
  const detener = iniciarJobCorreos({ procesar }, { cron: '* * * * *' }, { now: () => AHORA }, programar, registro);
  return { estado, lineas, detener };
}

describe('iniciarJobCorreos', () => {
  it('programa con la expresión configurada y procesa con el ahora del reloj', async () => {
    const procesar = jest.fn().mockResolvedValue(3);
    const { estado, lineas } = iniciar(procesar);

    expect(estado.expresion).toBe('* * * * *');
    await estado.tarea!();

    expect(procesar).toHaveBeenCalledWith(AHORA);
    expect(lineas).toEqual(['info: Job de correos programado con "* * * * *"', 'info: Correos: 3 correos procesados']);
  });

  it('sin correos pendientes no escribe en el log', async () => {
    const { estado, lineas } = iniciar(jest.fn().mockResolvedValue(0));
    await estado.tarea!();
    expect(lineas).toHaveLength(1);
  });

  it('salta una corrida si la anterior sigue en curso', async () => {
    let soltar: (n: number) => void = () => {};
    const procesar = jest
      .fn()
      .mockImplementationOnce(() => new Promise<number>((resolver) => (soltar = resolver)))
      .mockResolvedValue(0);
    const { estado, lineas } = iniciar(procesar);

    const primera = estado.tarea!();
    await estado.tarea!();
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('info: Correos: la corrida anterior sigue en curso, se salta esta');

    soltar(0);
    await primera;
    await estado.tarea!();
    expect(procesar).toHaveBeenCalledTimes(2);
  });

  it('un error queda en el log y no detiene el job', async () => {
    const procesar = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValueOnce(1);
    const { estado, lineas } = iniciar(procesar);

    await estado.tarea!();
    await estado.tarea!();

    expect(lineas).toEqual([
      'info: Job de correos programado con "* * * * *"',
      'error: Correos: falló la corrida',
      'info: Correos: 1 correos procesados',
    ]);
  });

  it('la función devuelta detiene la tarea', () => {
    const { estado, detener } = iniciar(jest.fn());
    detener();
    expect(estado.detenido).toBe(true);
  });
});
