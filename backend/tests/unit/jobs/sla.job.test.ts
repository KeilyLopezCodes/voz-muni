import { iniciarJobSla, type Programador, type RegistroJob } from '../../../src/infrastructure/jobs/sla.job';

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

function iniciar(alertas: jest.Mock, escalamiento: jest.Mock, cierre: jest.Mock = jest.fn().mockResolvedValue(0)) {
  const { estado, programar } = programadorFalso();
  const { lineas, registro } = registroFalso();
  const detener = iniciarJobSla(
    { alertas: { procesar: alertas }, escalamiento: { procesar: escalamiento }, cierre: { procesar: cierre } },
    { cron: '*/5 * * * *' },
    { now: () => AHORA },
    programar,
    registro,
  );
  return { estado, lineas, detener };
}

describe('iniciarJobSla', () => {
  it('programa con la expresión configurada y ejecuta los 3 pasos en orden con el mismo ahora', async () => {
    const orden: string[] = [];
    const alertas = jest.fn(async (ahora: Date) => (orden.push(`alertas ${ahora.toISOString()}`), 2));
    const escalamiento = jest.fn(async (ahora: Date) => (orden.push(`escalamiento ${ahora.toISOString()}`), 1));
    const cierre = jest.fn(async (ahora: Date) => (orden.push(`cierre ${ahora.toISOString()}`), 4));
    const { estado, lineas } = iniciar(alertas, escalamiento, cierre);

    expect(estado.expresion).toBe('*/5 * * * *');
    expect(lineas).toEqual(['info: Job de SLA programado con "*/5 * * * *"']);
    await estado.tarea!();
    expect(orden).toEqual([
      `alertas ${AHORA.toISOString()}`,
      `escalamiento ${AHORA.toISOString()}`,
      `cierre ${AHORA.toISOString()}`,
    ]);
    expect(lineas).toEqual(
      expect.arrayContaining([
        'info: SLA: 2 alertas enviadas',
        'info: SLA: 1 quejas escaladas',
        'info: SLA: 4 quejas cerradas automáticamente',
      ]),
    );
  });

  it('un error en las alertas no impide el escalamiento, y el job sigue', async () => {
    const alertas = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValueOnce(0);
    const escalamiento = jest.fn().mockResolvedValue(0);
    const { estado, lineas } = iniciar(alertas, escalamiento);

    await expect(estado.tarea!()).resolves.toBeUndefined();
    expect(escalamiento).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('error: SLA: falló el paso de alertas');
    await estado.tarea!();
    expect(alertas).toHaveBeenCalledTimes(2);
    expect(estado.detenido).toBe(false);
  });

  it('un error en el escalamiento queda en el log y no impide el cierre', async () => {
    const cierre = jest.fn().mockResolvedValue(0);
    const { estado, lineas } = iniciar(jest.fn().mockResolvedValue(0), jest.fn().mockRejectedValue(new Error('x')), cierre);
    await estado.tarea!();
    expect(lineas).toContain('error: SLA: falló el paso de escalamiento');
    expect(cierre).toHaveBeenCalledWith(AHORA);
  });

  it('salta la corrida si la anterior sigue en curso (la bandera cubre los dos pasos)', async () => {
    let terminar: () => void = () => {};
    const alertas = jest.fn().mockResolvedValue(0);
    const escalamiento = jest.fn(() => new Promise<number>((resolver) => (terminar = () => resolver(0))));
    const { estado, lineas } = iniciar(alertas, escalamiento);

    const primera = estado.tarea!();
    await new Promise((resolver) => setImmediate(resolver));
    await estado.tarea!();
    expect(alertas).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('info: SLA: la corrida anterior sigue en curso, se salta esta');
    terminar();
    await primera;
    const tercera = estado.tarea!();
    await new Promise((resolver) => setImmediate(resolver));
    expect(alertas).toHaveBeenCalledTimes(2);
    terminar();
    await tercera;
  });

  it('la función devuelta lo detiene', () => {
    const { estado, detener } = iniciar(jest.fn(), jest.fn());
    detener();
    expect(estado.detenido).toBe(true);
  });
});
