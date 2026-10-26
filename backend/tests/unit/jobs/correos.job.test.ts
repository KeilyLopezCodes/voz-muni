import { iniciarJobCorreos } from '../../../src/infrastructure/jobs/correos.job';
import type { Programador, RegistroJob } from '../../../src/infrastructure/jobs/sla.job';

const AHORA = new Date('2026-11-02T20:00:00.000Z');

interface Programacion {
  expresion: string;
  zonaHoraria?: string;
  tarea: () => Promise<void>;
  detenida: boolean;
}

// node-cron simulado: guarda cada programación (la de correos y la de la purga) para dispararla a mano.
function iniciar(
  despacho: jest.Mock,
  avisos: jest.Mock = jest.fn().mockResolvedValue(0),
  purga: jest.Mock = jest.fn().mockResolvedValue(0),
) {
  const programaciones: Programacion[] = [];
  const programar: Programador = (expresion, tarea, opciones) => {
    const programacion: Programacion = { expresion, zonaHoraria: opciones?.zonaHoraria, tarea, detenida: false };
    programaciones.push(programacion);
    return { stop: () => void (programacion.detenida = true) };
  };
  const lineas: string[] = [];
  const registro: RegistroJob = {
    info: (m) => lineas.push(`info: ${m}`),
    error: (m) => lineas.push(`error: ${m}`),
  };
  const detener = iniciarJobCorreos(
    { avisos: { procesar: avisos }, despacho: { procesar: despacho }, purga: { purgarLeidas: purga } },
    { cron: '* * * * *', purgaCron: '0 3 * * *' },
    { now: () => AHORA },
    programar,
    registro,
  );
  const [correos, purgaProgramada] = programaciones;
  return { estado: correos, purga: purgaProgramada, programaciones, lineas, detener };
}

const PROGRAMADOS = [
  'info: Job de correos programado con "* * * * *"',
  'info: Purga de notificaciones programada con "0 3 * * *" (America/Guatemala)',
];

describe('iniciarJobCorreos', () => {
  it('programa con la expresión configurada y ejecuta los avisos y luego el despacho con el mismo ahora', async () => {
    const orden: string[] = [];
    const avisos = jest.fn(async (ahora: Date) => (orden.push(`avisos ${ahora.toISOString()}`), 2));
    const despacho = jest.fn(async (ahora: Date) => (orden.push(`despacho ${ahora.toISOString()}`), 3));
    const { estado, lineas } = iniciar(despacho, avisos);

    expect(estado.expresion).toBe('* * * * *');
    await estado.tarea();

    expect(orden).toEqual([`avisos ${AHORA.toISOString()}`, `despacho ${AHORA.toISOString()}`]);
    expect(lineas).toEqual([
      ...PROGRAMADOS,
      'info: Correos: 2 avisos de comentarios encolados',
      'info: Correos: 3 correos procesados',
    ]);
  });

  it('sin trabajo no escribe en el log', async () => {
    const { estado, lineas } = iniciar(jest.fn().mockResolvedValue(0));
    await estado.tarea();
    expect(lineas).toEqual(PROGRAMADOS);
  });

  it('salta una corrida si la anterior sigue en curso', async () => {
    let soltar: (n: number) => void = () => {};
    const avisos = jest
      .fn()
      .mockImplementationOnce(() => new Promise<number>((resolver) => (soltar = resolver)))
      .mockResolvedValue(0);
    const despacho = jest.fn().mockResolvedValue(0);
    const { estado, lineas } = iniciar(despacho, avisos);

    const primera = estado.tarea();
    await estado.tarea();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(lineas).toContain('info: Correos: la corrida anterior sigue en curso, se salta esta');

    soltar(0);
    await primera;
    await estado.tarea();
    expect(avisos).toHaveBeenCalledTimes(2);
    expect(despacho).toHaveBeenCalledTimes(2);
  });

  it('un error en los avisos no impide el despacho, y un error no detiene el job', async () => {
    const avisos = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(0);
    const despacho = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(1);
    const { estado, lineas } = iniciar(despacho, avisos);

    await estado.tarea();
    await estado.tarea();

    expect(despacho).toHaveBeenCalledTimes(2);
    expect(lineas).toEqual([
      ...PROGRAMADOS,
      'error: Correos: falló el paso de avisos de comentarios',
      'error: Correos: falló el paso de despacho',
      'info: Correos: 1 correos procesados',
    ]);
  });

  it('la purga tiene su propia programación, en la zona America/Guatemala, y registra lo que borró (SPEC 36)', async () => {
    const purgarLeidas = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(4);
    const { purga, lineas } = iniciar(jest.fn().mockResolvedValue(0), undefined, purgarLeidas);

    expect(purga).toMatchObject({ expresion: '0 3 * * *', zonaHoraria: 'America/Guatemala' });
    await purga.tarea();
    await purga.tarea();

    expect(purgarLeidas).toHaveBeenCalledWith(AHORA);
    expect(lineas).toEqual([
      ...PROGRAMADOS,
      'error: Correos: falló el paso de purga de notificaciones',
      'info: Correos: 4 notificaciones leídas purgadas',
    ]);
  });

  it('la función devuelta detiene las dos programaciones', () => {
    const { programaciones, detener } = iniciar(jest.fn());
    detener();
    expect(programaciones.map((p) => p.detenida)).toEqual([true, true]);
  });
});
