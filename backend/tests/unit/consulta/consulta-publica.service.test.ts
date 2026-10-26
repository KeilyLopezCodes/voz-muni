import { ConsultaPublicaService, MAX_COMENTARIOS_PUBLICOS, MAX_EVENTOS_PUBLICOS } from '../../../src/application/services/consulta-publica.service';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import type {
  CambioDeEstadoPublico,
  ComentarioPublico,
  ConsultaPublicaRepository,
  QuejaPublica,
} from '../../../src/domain/repositories/consulta-publica-repository';
import { RelojFalso } from '../auth/dobles';

const AHORA = new Date('2026-11-02T15:00:00.000Z');
const VECINO = 7;
const TECNICO = 30;

function queja(cambios: Partial<QuejaPublica> = {}): QuejaPublica {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    titulo: 'Bache frente a la escuela',
    estado: 'en_proceso',
    categoria: 'Baches',
    zona: 'Zona 1',
    creadoEn: new Date('2026-10-30T14:00:00.000Z'),
    resueltoEn: null,
    cerradoEn: null,
    cierreAutomatico: false,
    resolucion: null,
    confirmacionVenceEn: null,
    solicitante: { id: VECINO, email: 'Ana@Correo.gt', telefono: '55550000' },
    ...cambios,
  };
}

class ConsultasEnMemoria implements ConsultaPublicaRepository {
  readonly limites: [string, number][] = [];

  constructor(
    private readonly quejas: QuejaPublica[],
    private readonly cambios: CambioDeEstadoPublico[] = [],
    private readonly comentarios: ComentarioPublico[] = [],
  ) {}

  async obtenerPorNumero(numero: string): Promise<QuejaPublica | null> {
    return this.quejas.find((q) => q.numero === numero) ?? null;
  }

  async cambiosDeEstado(_ticketId: number, limite: number): Promise<CambioDeEstadoPublico[]> {
    this.limites.push(['cambios', limite]);
    return this.cambios;
  }

  async comentariosPublicos(_ticketId: number, limite: number): Promise<ComentarioPublico[]> {
    this.limites.push(['comentarios', limite]);
    return this.comentarios;
  }
}

const servicio = (repo: ConsultaPublicaRepository) => new ConsultaPublicaService(repo, new RelojFalso(AHORA));

async function error(promesa: Promise<unknown>): Promise<ErrorDeAplicacion> {
  try {
    await promesa;
  } catch (e) {
    return e as ErrorDeAplicacion;
  }
  throw new Error('se esperaba un error');
}

describe('ConsultaPublicaService', () => {
  it('un correo con mayúsculas y espacios coincide, y un número en minúsculas también', async () => {
    const dto = await servicio(new ConsultasEnMemoria([queja()])).consultar('q-2026-000001', '  ANA@correo.GT ');
    expect(dto).toMatchObject({ numero: 'Q-2026-000001', estado: 'en_proceso', categoria: 'Baches', zona: 'Zona 1' });
  });

  it('un teléfono 5555-0000 coincide con 55550000', async () => {
    const dto = await servicio(new ConsultasEnMemoria([queja()])).consultar('Q-2026-000001', '5555-0000');
    expect(dto.numero).toBe('Q-2026-000001');
  });

  it('un contacto ajeno y un número inexistente lanzan el mismo CONSULTA_NO_ENCONTRADA', async () => {
    const consultas = servicio(new ConsultasEnMemoria([queja()]));
    const ajeno = await error(consultas.consultar('Q-2026-000001', 'otra@correo.gt'));
    const telefonoAjeno = await error(consultas.consultar('Q-2026-000001', '55551111'));
    const inexistente = await error(consultas.consultar('Q-2026-999999', 'ana@correo.gt'));

    for (const e of [ajeno, telefonoAjeno, inexistente]) {
      expect(e).toBeInstanceOf(ErrorDeAplicacion);
      expect({ codigo: e.codigo, mensaje: e.message }).toEqual({
        codigo: 'CONSULTA_NO_ENCONTRADA',
        mensaje: 'No encontramos una queja con esos datos',
      });
    }
  });

  it('un solicitante sin correo no coincide con ningún correo', async () => {
    const consultas = servicio(new ConsultasEnMemoria([queja({ solicitante: { id: VECINO, email: null, telefono: '55550000' } })]));
    expect((await error(consultas.consultar('Q-2026-000001', 'x@y.gt'))).codigo).toBe('CONSULTA_NO_ENCONTRADA');
  });

  it.each([
    ['un número mal formado', 'Q-26-1', 'ana@correo.gt'],
    ['un teléfono mal formado', 'Q-2026-000001', '1234'],
    ['un contacto en blanco', 'Q-2026-000001', '   '],
  ])('%s responde VALIDACION sin consultar la queja', async (_caso, numero, contacto) => {
    expect((await error(servicio(new ConsultasEnMemoria([])).consultar(numero, contacto))).codigo).toBe('VALIDACION');
  });

  it('traduce actores y autores, oculta los motivos no públicos y pide los topes', async () => {
    const repo = new ConsultasEnMemoria(
      [queja()],
      [
        { ocurridoEn: AHORA, usuarioId: TECNICO, estadoAnterior: 'en_proceso', estadoNuevo: 'en_espera', motivo: 'Una foto' },
        { ocurridoEn: AHORA, usuarioId: TECNICO, estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: 'Nota interna' },
        { ocurridoEn: AHORA, usuarioId: null, estadoAnterior: 'resuelta', estadoNuevo: 'cerrada', motivo: null },
        { ocurridoEn: AHORA, usuarioId: VECINO, estadoAnterior: null, estadoNuevo: 'nueva', motivo: null },
      ],
      [
        { cuerpo: 'Vamos mañana', autorId: TECNICO, creadoEn: AHORA, editadoEn: null },
        { cuerpo: 'Gracias', autorId: VECINO, creadoEn: AHORA, editadoEn: AHORA },
      ],
    );

    const dto = await servicio(repo).consultar('Q-2026-000001', 'ana@correo.gt');

    expect(dto.lineaTiempo.map((e) => [e.actor, e.motivo])).toEqual([
      ['municipalidad', 'Una foto'],
      ['municipalidad', null],
      ['sistema', null],
      ['vecino', null],
    ]);
    expect(dto.comentarios).toEqual([
      { cuerpo: 'Vamos mañana', autor: 'municipalidad', creadoEn: AHORA.toISOString(), editadoEn: null },
      { cuerpo: 'Gracias', autor: 'vecino', creadoEn: AHORA.toISOString(), editadoEn: AHORA.toISOString() },
    ]);
    expect(repo.limites).toEqual([
      ['cambios', MAX_EVENTOS_PUBLICOS],
      ['comentarios', MAX_COMENTARIOS_PUBLICOS],
    ]);
  });

  it('solucion aparece en resuelta y cerrada; confirmacion solo en resuelta, con vencida según el reloj', async () => {
    const resuelta = queja({
      estado: 'resuelta',
      resolucion: 'Se rellenó',
      resueltoEn: new Date('2026-11-01T15:00:00.000Z'),
      confirmacionVenceEn: new Date('2026-11-08T05:59:59.999Z'),
    });
    const cerrada = { ...resuelta, numero: 'Q-2026-000002', estado: 'cerrada' as const, cierreAutomatico: true };
    const vencida = { ...resuelta, numero: 'Q-2026-000003', confirmacionVenceEn: new Date('2026-11-01T00:00:00.000Z') };
    const consultas = servicio(new ConsultasEnMemoria([resuelta, cerrada, vencida, queja({ numero: 'Q-2026-000004' })]));

    expect(await consultas.consultar('Q-2026-000001', 'ana@correo.gt')).toMatchObject({
      solucion: { descripcion: 'Se rellenó', resueltaEn: '2026-11-01T15:00:00.000Z' },
      confirmacion: { venceEn: '2026-11-08T05:59:59.999Z', vencida: false },
      esperaRespuesta: false,
    });
    expect(await consultas.consultar('Q-2026-000002', 'ana@correo.gt')).toMatchObject({
      solucion: { descripcion: 'Se rellenó' },
      confirmacion: null,
      cierreAutomatico: true,
    });
    expect((await consultas.consultar('Q-2026-000003', 'ana@correo.gt')).confirmacion).toEqual({
      venceEn: '2026-11-01T00:00:00.000Z',
      vencida: true,
    });
    expect(await consultas.consultar('Q-2026-000004', 'ana@correo.gt')).toMatchObject({ solucion: null, confirmacion: null });
  });

  it('nunca devuelve datos personales ni ids internos', async () => {
    const dto = await servicio(new ConsultasEnMemoria([queja({ estado: 'en_espera' })])).consultar('Q-2026-000001', '55550000');
    const texto = JSON.stringify(dto);
    expect(dto.esperaRespuesta).toBe(true);
    expect(Object.keys(dto)).not.toContain('id');
    expect(texto).not.toMatch(/correo\.gt|55550000|solicitante/i);
  });
});
