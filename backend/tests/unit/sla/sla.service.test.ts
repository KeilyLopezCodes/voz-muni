import { SlaService, type TicketConPolitica } from '../../../src/application/services/sla.service';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { CalendarioRepository } from '../../../src/domain/repositories/calendario-repository';
import type { ParametroRepository } from '../../../src/domain/repositories/parametro-repository';
import type { CategoriaConSla, PoliticaSlaRepository } from '../../../src/domain/repositories/politica-sla-repository';

const DIAS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'];

// Guatemala está en UTC−6 todo el año. Solo para armar los datos de prueba.
function gt(fecha: string, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const base = new Date(`${fecha}T00:00:00.000Z`).getTime();
  return new Date(base + ((h + 6) * 60 + m) * 60_000);
}

class ParametrosFalsos implements ParametroRepository {
  constructor(public jornada: unknown = { inicio: '08:00', fin: '16:00' }) {}

  async obtener(clave: string): Promise<unknown | null> {
    return clave === 'jornada_laboral' ? this.jornada : null;
  }

  async guardar(): Promise<void> {}
}

class CalendarioFalso implements Pick<CalendarioRepository, 'diasHabilesDesde' | 'diasHabilesEntre'> {
  readonly pedidosDesde: [string, number][] = [];

  constructor(private readonly dias: string[] = DIAS) {}

  async diasHabilesDesde(desde: string, cantidad: number): Promise<string[]> {
    this.pedidosDesde.push([desde, cantidad]);
    return this.dias.filter((d) => d >= desde).slice(0, cantidad);
  }

  async diasHabilesEntre(desde: string, hasta: string): Promise<string[]> {
    if (hasta > this.dias.at(-1)!) {
      throw new ReglaDeNegocioError('CALENDARIO_INCOMPLETO', 'sin calendario');
    }
    return this.dias.filter((d) => d >= desde && d <= hasta);
  }
}

const BACHES: CategoriaConSla = {
  categoria: { id: 4, nombre: 'Baches', activa: true },
  dependencia: { id: 1, nombre: 'Obras' },
  plazos: [
    { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
    { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 16 },
  ],
  completa: false,
  actualizadoEn: null,
  actualizadoPor: null,
};

const politicas: Pick<PoliticaSlaRepository, 'obtenerCategoria'> = {
  obtenerCategoria: async (id) => (id === 4 ? BACHES : null),
};

function ticket(cambios: Partial<TicketConPolitica> = {}): TicketConPolitica {
  return {
    creadoEn: gt('2026-10-26', '10:00'),
    venceRespuesta: null,
    venceResolucion: null,
    primeraRespuestaEn: null,
    inicioResolucion: null,
    pausaMinutos: 0,
    pausadoDesde: null,
    restanteMinutos: null,
    categoriaId: 4,
    prioridad: 'alta',
    ...cambios,
  };
}

describe('SlaService', () => {
  it('al aceptar calcula los dos vencimientos con la política de la categoría y la prioridad', async () => {
    const servicio = new SlaService(new ParametrosFalsos(), new CalendarioFalso(), politicas);
    expect(await servicio.alAceptar(ticket())).toEqual({
      inicioResolucion: gt('2026-10-26', '10:00'),
      venceRespuesta: gt('2026-10-27', '10:00'),
      venceResolucion: gt('2026-10-28', '10:00'),
    });
  });

  it('pide ceil(minutos / jornada) + 1 días desde la fecha local de inicio', async () => {
    const calendario = new CalendarioFalso();
    await new SlaService(new ParametrosFalsos(), calendario, politicas).alAceptar(ticket());
    // 8 h = 480 min → 1 + 1 días; 16 h = 960 min → 2 + 1 días.
    expect(calendario.pedidosDesde).toEqual([
      ['2026-10-26', 2],
      ['2026-10-26', 3],
    ]);
  });

  it.each([
    ['la prioridad', ticket({ prioridad: 'urgente' })],
    ['la categoría', ticket({ categoriaId: 99 })],
  ])('sin política para %s → SLA_NO_CONFIGURADO, también al reabrir', async (_caso, sinPolitica) => {
    const servicio = new SlaService(new ParametrosFalsos(), new CalendarioFalso(), politicas);
    await expect(servicio.alAceptar(sinPolitica)).rejects.toMatchObject({ codigo: 'SLA_NO_CONFIGURADO' });
    await expect(servicio.alReabrir(sinPolitica, gt('2026-10-27', '10:00'))).rejects.toMatchObject({
      codigo: 'SLA_NO_CONFIGURADO',
    });
  });

  it.each([
    ['ausente', null],
    ['al revés', { inicio: '16:00', fin: '08:00' }],
  ])('con la jornada %s → PARAMETRO_INVALIDO', async (_caso, jornada) => {
    const servicio = new SlaService(new ParametrosFalsos(jornada), new CalendarioFalso(), politicas);
    await expect(servicio.alAceptar(ticket())).rejects.toMatchObject({ codigo: 'PARAMETRO_INVALIDO' });
  });

  it('con el calendario corto → CALENDARIO_INCOMPLETO, al sumar y al contar', async () => {
    const servicio = new SlaService(new ParametrosFalsos(), new CalendarioFalso(['2026-10-26']), politicas);
    await expect(servicio.alAceptar(ticket())).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'CALENDARIO_INCOMPLETO',
    });
    const enPlazo = ticket({ venceResolucion: gt('2026-11-10', '10:00') });
    const completo = new SlaService(new ParametrosFalsos(), new CalendarioFalso(), politicas);
    await expect(completo.alPonerEnEspera(enPlazo, gt('2026-10-26', '11:00'))).rejects.toMatchObject({
      codigo: 'CALENDARIO_INCOMPLETO',
    });
  });

  it('poner en espera y reanudar usan el mismo reloj hábil', async () => {
    const servicio = new SlaService(new ParametrosFalsos(), new CalendarioFalso(), politicas);
    const enEspera = await servicio.alPonerEnEspera(ticket({ venceResolucion: gt('2026-10-28', '10:00') }), gt('2026-10-27', '10:00'));
    expect(enEspera).toEqual({ restanteMinutos: 480, pausadoDesde: gt('2026-10-27', '10:00'), venceResolucion: null });
    const reanudada = await servicio.alReanudar(ticket(enEspera), gt('2026-10-27', '15:00'));
    expect(reanudada).toEqual({
      pausaMinutos: 300,
      venceResolucion: gt('2026-10-28', '15:00'),
      pausadoDesde: null,
      restanteMinutos: null,
    });
  });

  it('iniciar no lee nada', () => {
    const servicio = new SlaService(new ParametrosFalsos(null), new CalendarioFalso([]), politicas);
    expect(servicio.alIniciar(ticket(), gt('2026-10-26', '11:00'))).toEqual({ primeraRespuestaEn: gt('2026-10-26', '11:00') });
  });
});
