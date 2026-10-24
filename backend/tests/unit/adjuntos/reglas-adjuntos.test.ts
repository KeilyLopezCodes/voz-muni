import {
  decidirOrigen,
  esBorrable,
  exigirBorrable,
  exigirCupo,
  exigirVisibilidad,
} from '../../../src/domain/adjuntos/reglas-adjuntos';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

const VECINO = 7;
const RECEPTOR = 20;
const TECNICO = 30;

describe('decidirOrigen', () => {
  const contexto = (usuarioId: number, estadoTicket: EstadoTicket, registradoPor: number | null = VECINO) => ({
    estadoTicket,
    usuarioId,
    solicitanteId: VECINO,
    registradoPor,
  });

  it('el solicitante en nueva → registro', () => {
    expect(decidirOrigen(contexto(VECINO, 'nueva'))).toBe('registro');
  });

  it('el receptor que registró en ventanilla, en nueva → registro', () => {
    expect(decidirOrigen(contexto(RECEPTOR, 'nueva', RECEPTOR))).toBe('registro');
  });

  it('un interno que no registró, aunque esté en nueva → atencion', () => {
    expect(decidirOrigen(contexto(TECNICO, 'nueva'))).toBe('atencion');
  });

  it('el receptor que registró, fuera de nueva → atencion', () => {
    expect(decidirOrigen(contexto(RECEPTOR, 'en_revision', RECEPTOR))).toBe('atencion');
  });

  it.each<EstadoTicket>(['en_revision', 'asignada', 'en_proceso', 'en_espera', 'cerrada'])(
    'el solicitante en %s → ADJUNTOS_CERRADOS',
    (estado) => {
      expect(codigoDe(() => decidirOrigen(contexto(VECINO, estado)))).toBe('ADJUNTOS_CERRADOS');
    },
  );
});

describe('exigirVisibilidad', () => {
  it('un registro interno → VALIDACION', () => {
    expect(codigoDe(() => exigirVisibilidad('registro', 'nueva', true))).toBe('VALIDACION');
    expect(codigoDe(() => exigirVisibilidad('registro', 'nueva', false))).toBeNull();
  });

  it.each<EstadoTicket>(['cerrada', 'rechazada'])('en una queja %s solo internos', (estado) => {
    expect(codigoDe(() => exigirVisibilidad('atencion', estado, false))).toBe('QUEJA_FINALIZADA');
    expect(codigoDe(() => exigirVisibilidad('atencion', estado, true))).toBeNull();
  });

  it('en una queja abierta, público o interno', () => {
    expect(codigoDe(() => exigirVisibilidad('atencion', 'en_proceso', false))).toBeNull();
    expect(codigoDe(() => exigirVisibilidad('atencion', 'en_proceso', true))).toBeNull();
  });
});

describe('exigirCupo', () => {
  it.each([
    [0, 5],
    [3, 2],
    [4, 1],
  ])('con %i guardados, %i nuevos caben', (existentes, nuevos) => {
    expect(codigoDe(() => exigirCupo(existentes, nuevos))).toBeNull();
  });

  it('con 3 guardados, 3 nuevos → LIMITE_ADJUNTOS con 2 restantes', () => {
    let error: unknown;
    try {
      exigirCupo(3, 3);
    } catch (capturado) {
      error = capturado;
    }
    expect(error).toMatchObject({ codigo: 'LIMITE_ADJUNTOS', detalles: [{ campo: 'restantes', problema: '2' }] });
  });

  it('con 5 guardados no cabe ninguno', () => {
    expect(codigoDe(() => exigirCupo(5, 1))).toBe('LIMITE_ADJUNTOS');
  });
});

describe('exigirBorrable', () => {
  const subido = new Date('2026-10-23T15:00:00.000Z');

  it('acepta a los 5 minutos exactos y rechaza 1 ms después con EDICION_VENCIDA', () => {
    expect(codigoDe(() => exigirBorrable(subido, new Date('2026-10-23T15:05:00.000Z')))).toBeNull();
    expect(codigoDe(() => exigirBorrable(subido, new Date('2026-10-23T15:05:00.001Z')))).toBe('EDICION_VENCIDA');
    expect(esBorrable(subido, new Date('2026-10-23T15:05:00.001Z'))).toBe(false);
  });
});
