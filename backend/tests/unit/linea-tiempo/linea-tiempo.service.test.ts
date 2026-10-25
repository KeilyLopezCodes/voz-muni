import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import {
  codificarCursor,
  decodificarCursor,
  LineaTiempoService,
} from '../../../src/application/services/linea-tiempo.service';
import type {
  EventoLineaTiempo,
  FiltroLineaTiempo,
  LineaTiempoRepository,
} from '../../../src/domain/repositories/linea-tiempo-repository';
import type { TicketResumen } from '../../../src/domain/repositories/ticket-lectura-repository';

const VECINO: UsuarioAutenticado = {
  id: 1,
  nombre: 'Ana Vecina',
  rol: 'vecino',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'propia', 'comentarios.publico': 'propia' },
};

const COORDINADOR: UsuarioAutenticado = {
  id: 2,
  nombre: 'Carlos Coordinador',
  rol: 'coordinador',
  dependenciaId: 10,
  permisos: { 'tickets.ver': 'dependencia', 'comentarios.publico': 'si', 'comentarios.interno': 'si' },
};

const ADMINISTRADOR: UsuarioAutenticado = {
  id: 3,
  nombre: 'Alma Admin',
  rol: 'administrador',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'todas' },
};

const usuario = (id: number, nombre: string, esSolicitante = false) =>
  ({ tipo: 'usuario', id, nombre, rol: esSolicitante ? 'vecino' : 'tecnico', esSolicitante }) as const;

const EVENTOS: EventoLineaTiempo[] = [
  {
    id: 'estado:5',
    ocurridoEn: '2026-10-22T18:00:00.000Z',
    actor: usuario(7, 'Tomás Técnico'),
    detalle: { tipo: 'estado', estadoAnterior: 'en_proceso', estadoNuevo: 'resuelta', motivo: 'Se rellenó el bache' },
  },
  {
    id: 'comentario:3',
    ocurridoEn: '2026-10-22T17:00:00.000Z',
    actor: usuario(1, 'Ana Vecina', true),
    detalle: { tipo: 'comentario', comentarioId: 3, interno: false },
  },
  {
    id: 'estado:4',
    ocurridoEn: '2026-10-22T16:00:00.000Z',
    actor: usuario(7, 'Tomás Técnico'),
    detalle: { tipo: 'estado', estadoAnterior: 'en_proceso', estadoNuevo: 'en_espera', motivo: 'Envíe una foto' },
  },
  {
    id: 'estado:3',
    ocurridoEn: '2026-10-21T16:00:00.000Z',
    actor: usuario(8, 'Sara Supervisora'),
    detalle: { tipo: 'estado', estadoAnterior: 'en_revision', estadoNuevo: 'asignada', motivo: 'Categoría: A → B' },
  },
  {
    id: 'estado:2',
    ocurridoEn: '2026-10-21T15:00:00.000Z',
    actor: { tipo: 'sistema' },
    detalle: { tipo: 'estado', estadoAnterior: 'asignada', estadoNuevo: 'en_revision', motivo: 'Traslado interno' },
  },
];

class LineaTiempoFalsa implements LineaTiempoRepository {
  readonly filtros: FiltroLineaTiempo[] = [];

  constructor(private readonly eventos: EventoLineaTiempo[] = EVENTOS) {}

  async listar(_ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLineaTiempo[]> {
    this.filtros.push(filtro);
    return this.eventos.slice(0, filtro.limite);
  }
}

function servicio(repo: LineaTiempoRepository, existe = true): LineaTiempoService {
  return new LineaTiempoService(
    {
      obtenerParaAccion: async (_u, _a, id) => {
        if (!existe) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
        }
        return { id } as TicketResumen;
      },
    },
    repo,
  );
}

const cursorDe = (datos: unknown) => Buffer.from(JSON.stringify(datos)).toString('base64url');

describe('LineaTiempoService', () => {
  it('fuera de alcance responde NO_ENCONTRADO sin leer la línea de tiempo', async () => {
    const repo = new LineaTiempoFalsa();
    await expect(servicio(repo, false).listar(VECINO, 9, null, 50)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(repo.filtros).toEqual([]);
  });

  describe('vista pública (alcance propia)', () => {
    it('pide la vista pública sin internos y con un evento de más', async () => {
      const repo = new LineaTiempoFalsa();
      await servicio(repo).listar(VECINO, 9, null, 50);
      expect(repo.filtros[0]).toEqual({ vistaPublica: true, incluirInternos: false, usuarioId: 1, antesDe: null, limite: 51 });
    });

    it('conserva los motivos públicos y deja en null los demás', async () => {
      const { datos } = await servicio(new LineaTiempoFalsa()).listar(VECINO, 9, null, 50);
      const motivos = Object.fromEntries(
        datos.flatMap((e) => (e.detalle.tipo === 'estado' ? [[e.id, e.detalle.motivo]] : [])),
      );
      expect(motivos).toEqual({
        'estado:5': 'Se rellenó el bache',
        'estado:4': 'Envíe una foto',
        'estado:3': null,
        'estado:2': null,
      });
    });

    it('el actor es tu, municipalidad o sistema', async () => {
      const { datos } = await servicio(new LineaTiempoFalsa()).listar(VECINO, 9, null, 50);
      expect(datos.map((e) => [e.id, e.actor])).toEqual([
        ['estado:5', { tipo: 'municipalidad' }],
        ['comentario:3', { tipo: 'tu' }],
        ['estado:4', { tipo: 'municipalidad' }],
        ['estado:3', { tipo: 'municipalidad' }],
        ['estado:2', { tipo: 'sistema' }],
      ]);
    });
  });

  describe('vista interna', () => {
    it('trae nombre, rol y esSolicitante, y todos los motivos', async () => {
      const repo = new LineaTiempoFalsa();
      const { datos } = await servicio(repo).listar(COORDINADOR, 9, null, 50);
      expect(repo.filtros[0]).toMatchObject({ vistaPublica: false, incluirInternos: true });
      expect(datos).toEqual(EVENTOS);
      expect(datos[1].actor).toEqual({ tipo: 'usuario', id: 1, nombre: 'Ana Vecina', rol: 'vecino', esSolicitante: true });
    });

    it('sin comentarios.interno no incluye internos', async () => {
      const repo = new LineaTiempoFalsa();
      await servicio(repo).listar(ADMINISTRADOR, 9, null, 50);
      expect(repo.filtros[0]).toMatchObject({ vistaPublica: false, incluirInternos: false });
    });
  });

  describe('paginación', () => {
    it.each([3, 5])('siguienteCursor es null si el repositorio devuelve %s eventos con tamano 5', async (cuantos) => {
      const repo = new LineaTiempoFalsa(EVENTOS.slice(0, cuantos));
      const { datos, siguienteCursor } = await servicio(repo).listar(COORDINADOR, 9, null, 5);
      expect(datos).toHaveLength(cuantos);
      expect(siguienteCursor).toBeNull();
    });

    it('con un evento de más corta en tamano y el cursor apunta al último de la página', async () => {
      const { datos, siguienteCursor } = await servicio(new LineaTiempoFalsa()).listar(COORDINADOR, 9, null, 2);
      expect(datos.map((e) => e.id)).toEqual(['estado:5', 'comentario:3']);
      expect(decodificarCursor(siguienteCursor!)).toEqual({
        ocurridoEn: new Date('2026-10-22T17:00:00.000Z'),
        id: 'comentario:3',
      });
    });

    it('pasa el cursor al repositorio', async () => {
      const repo = new LineaTiempoFalsa();
      const antesDe = { ocurridoEn: new Date('2026-10-22T17:00:00.000Z'), id: 'comentario:3' };
      await servicio(repo).listar(COORDINADOR, 9, antesDe, 2);
      expect(repo.filtros[0]).toMatchObject({ antesDe, limite: 3 });
    });
  });
});

describe('cursor', () => {
  it('ida y vuelta', () => {
    expect(decodificarCursor(codificarCursor(EVENTOS[2]))).toEqual({
      ocurridoEn: new Date('2026-10-22T16:00:00.000Z'),
      id: 'estado:4',
    });
  });

  it.each([
    ['basura', 'no-es-base64-json'],
    ['sin id', cursorDe({ ocurridoEn: '2026-10-22T16:00:00.000Z' })],
    ['id inválido', cursorDe({ ocurridoEn: '2026-10-22T16:00:00.000Z', id: "x'; --" })],
    ['fecha inválida', cursorDe({ ocurridoEn: 'ayer', id: 'estado:1' })],
    ['un número', cursorDe(42)],
    ['null', cursorDe(null)],
  ])('%s → null', (_caso, cursor) => {
    expect(decodificarCursor(cursor)).toBeNull();
  });
});
