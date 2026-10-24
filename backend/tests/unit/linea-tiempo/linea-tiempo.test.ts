import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import {
  codificarCursor,
  decodificarCursor,
  LineaTiempoService,
} from '../../../src/application/services/linea-tiempo.service';
import { esVistaPublica, motivoEsPublico } from '../../../src/domain/linea-tiempo/visibilidad';
import type { EventoLeido, FiltroLineaTiempo } from '../../../src/domain/repositories/linea-tiempo-repository';
import type { TicketResumen } from '../../../src/domain/repositories/ticket-lectura-repository';

describe('motivoEsPublico', () => {
  it.each([
    ['en_revision', 'rechazada'],
    ['en_proceso', 'en_espera'],
    ['en_proceso', 'resuelta'],
    ['resuelta', 'en_proceso'],
  ] as const)('%s → %s es público', (anterior, nuevo) => {
    expect(motivoEsPublico(anterior, nuevo)).toBe(true);
  });

  it.each([
    [null, 'nueva'],
    ['en_revision', 'asignada'],
    ['asignada', 'en_revision'],
    ['en_proceso', 'en_revision'],
    ['resuelta', 'cerrada'],
    ['en_espera', 'en_proceso'],
  ] as const)('%s → %s no es público', (anterior, nuevo) => {
    expect(motivoEsPublico(anterior, nuevo)).toBe(false);
  });

  it('esVistaPublica solo con propia', () => {
    expect(esVistaPublica('propia')).toBe(true);
    expect(esVistaPublica('todas')).toBe(false);
    expect(esVistaPublica(undefined)).toBe(false);
  });
});

describe('cursor', () => {
  it('ida y vuelta', () => {
    const cursor = { ocurridoEn: '2026-10-24T06:56:22.232000Z', id: 'estado:2' };
    expect(decodificarCursor(codificarCursor(cursor))).toEqual(cursor);
  });

  it.each(['xyz', codificarCursor({ ocurridoEn: 'ayer', id: 'estado:1' }), codificarCursor({ ocurridoEn: '2026-10-24T06:56:22.232000Z', id: "1' OR 1=1" })])(
    'rechaza %s',
    (texto) => {
      expect(() => decodificarCursor(texto)).toThrow(ErrorDeAplicacion);
    },
  );
});

describe('LineaTiempoService', () => {
  const vecino: UsuarioAutenticado = {
    id: 7,
    nombre: 'Vecina',
    rol: 'vecino',
    dependenciaId: null,
    permisos: { 'tickets.ver': 'propia', 'comentarios.publico': 'si' },
  };
  const coordinador: UsuarioAutenticado = {
    id: 3,
    nombre: 'Coord',
    rol: 'coordinador',
    dependenciaId: 1,
    permisos: { 'tickets.ver': 'dependencia', 'comentarios.interno': 'si' },
  };
  const ticket = { id: 1, solicitanteId: 7 } as TicketResumen;
  const evento = (id: string, actor: EventoLeido['actor'], detalle: EventoLeido['detalle']): EventoLeido => ({
    id,
    ocurridoEn: new Date('2026-10-24T10:00:00Z'),
    ocurridoUs: '2026-10-24T10:00:00.000000Z',
    actor,
    detalle,
  });
  const eventos: EventoLeido[] = [
    evento('estado:3', { id: 3, nombre: 'Coord', rol: 'coordinador' }, {
      tipo: 'estado',
      estadoAnterior: 'asignada',
      estadoNuevo: 'en_revision',
      motivo: 'traslado interno',
    }),
    evento('estado:2', { id: 3, nombre: 'Coord', rol: 'coordinador' }, {
      tipo: 'estado',
      estadoAnterior: 'en_proceso',
      estadoNuevo: 'en_espera',
      motivo: 'Envíe foto',
    }),
    evento('comentario:1', { id: 7, nombre: 'Vecina', rol: 'vecino' }, { tipo: 'comentario', comentarioId: 1, interno: false }),
    evento('estado:1', null, { tipo: 'estado', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null }),
  ];

  function servicio() {
    const filtros: FiltroLineaTiempo[] = [];
    const repositorio = {
      listar: async (_id: number, filtro: FiltroLineaTiempo) => {
        filtros.push(filtro);
        return eventos.slice(0, filtro.limite);
      },
    };
    return { filtros, svc: new LineaTiempoService({ obtenerParaAccion: async () => ticket }, repositorio) };
  }

  it('vista pública: oculta motivos internos y cambia los actores', async () => {
    const { svc, filtros } = servicio();
    const pagina = await svc.listar(vecino, 1, undefined, 50);
    expect(filtros[0]).toMatchObject({ vistaPublica: true, incluirInternos: false, limite: 51 });
    expect(pagina.datos.map((e) => e.actor.tipo)).toEqual(['municipalidad', 'municipalidad', 'tu', 'sistema']);
    expect(pagina.datos[0].detalle).toMatchObject({ motivo: null });
    expect(pagina.datos[1].detalle).toMatchObject({ motivo: 'Envíe foto' });
    expect(pagina.siguienteCursor).toBeNull();
  });

  it('vista interna: nombre, rol y esSolicitante; cursor si hay más', async () => {
    const { svc, filtros } = servicio();
    const pagina = await svc.listar(coordinador, 1, undefined, 2);
    expect(filtros[0]).toMatchObject({ vistaPublica: false, incluirInternos: true, limite: 3 });
    expect(pagina.datos).toHaveLength(2);
    expect(pagina.datos[0].actor).toEqual({ tipo: 'usuario', id: 3, nombre: 'Coord', rol: 'coordinador', esSolicitante: false });
    expect(pagina.datos[0].detalle).toMatchObject({ motivo: 'traslado interno' });
    expect(decodificarCursor(pagina.siguienteCursor!)).toEqual({ ocurridoEn: '2026-10-24T10:00:00.000000Z', id: 'estado:2' });
  });
});
