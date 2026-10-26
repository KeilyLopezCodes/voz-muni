import { iniciarJobAlertasSla, type Programador, type RegistroJob } from '../../../src/infrastructure/jobs/alertas-sla.job';

const AHORA = new Date('2026-11-02T20:00:00.000Z');

// node-cron simulado: guarda la expresión y la tarea para dispararla a mano.
function programadorFalso() {
  const estado = { expresion: '', detenido: false, tarea: null as null | (() => Promise<void>) };
  const programar: Programador = (expresion, tarea) => {
    estado.expresion = expresion;
    estado.tarea = tarea;
    return { stop: () => void (estado.detenido = true) };
  };
  return { estado, programar };
}

function registroFalso() {
  const lineas: string[] = [];
  const registro: RegistroJob = {
    info: (m) => lineas.push(`info: ${m}`),
    error: (m) => lineas.push(`error: ${m}`),
  };
  return { lineas, registro };
}

describe('iniciarJobAlertasSla', () => {
  it('programa con la expresión configurada y llama a procesar con la hora del reloj', async () => {
    const { estado, programar } = programadorFalso();
    const { lineas, registro } = registroFalso();
    const procesar = jest.fn().mockResolvedValue(3);
    iniciarJobAlertasSla({ procesar }, { cron: '*/5 * * * *' }, { now: () => AHORA }, programar, registro);

    expect(estado.expresion).toBe('*/5 * * * *');
    expect(lineas).toEqual(['info: Alertas de SLA programadas con "*/5 * * * *"']);
    await estado.tarea!();
    expect(procesar).toHaveBeenCalledWith(AHORA);
    expect(lineas).toContain('info: Alertas de SLA: 3 enviadas');
  });

  it('salta una corrida si la anterior sigue en curso', async () => {
    const { estado, programar } = programadorFalso();
    const { lineas, registro } = registroFalso();
    let terminar: () => void = () => {};
    const procesar = jest.fn(() => new Promise<number>((resolver) => (terminar = () => resolver(0))));
    iniciarJobAlertasSla({ procesar }, { cron: '* * * * *' }, { now: () => AHORA }, programar, registro);

    const primera = estado.tarea!();
    await estado.tarea!();
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('info: Alertas de SLA: la corrida anterior sigue en curso, se salta esta');
    terminar();
    await primera;
    // Terminada la anterior, la siguiente corre.
    const tercera = estado.tarea!();
    expect(procesar).toHaveBeenCalledTimes(2);
    terminar();
    await tercera;
  });

  it('un error queda en el log y no detiene el job', async () => {
    const { estado, programar } = programadorFalso();
    const { lineas, registro } = registroFalso();
    const procesar = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValueOnce(1);
    iniciarJobAlertasSla({ procesar }, { cron: '* * * * *' }, { now: () => AHORA }, programar, registro);

    await expect(estado.tarea!()).resolves.toBeUndefined();
    expect(lineas).toContain('error: Alertas de SLA: la corrida falló');
    await estado.tarea!();
    expect(procesar).toHaveBeenCalledTimes(2);
    expect(estado.detenido).toBe(false);
  });

  it('la función devuelta lo detiene', () => {
    const { estado, programar } = programadorFalso();
    const detener = iniciarJobAlertasSla(
      { procesar: jest.fn() },
      { cron: '* * * * *' },
      { now: () => AHORA },
      programar,
      registroFalso().registro,
    );
    detener();
    expect(estado.detenido).toBe(true);
  });
});
