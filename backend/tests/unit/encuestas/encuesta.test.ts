import {
  esCalificable,
  exigirCalificable,
  plazoEncuestaValido,
  umbralEncuestaValido,
  validarEncuesta,
  venceEncuesta,
} from '../../../src/domain/encuestas/encuesta';

const CERRADA = new Date('2026-11-01T15:00:00.000Z');
const TREINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

const codigo = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { codigo: string }).codigo;
  }
  return null;
};

describe('validarEncuesta', () => {
  it('acepta 1 y 5, y recorta el comentario', () => {
    expect(validarEncuesta(1, undefined)).toEqual({ calificacion: 1, comentario: null });
    expect(validarEncuesta(5, '  Muy bien  ')).toEqual({ calificacion: 5, comentario: 'Muy bien' });
  });

  it.each([0, 6, 3.5, '4', null])('la calificación %p lanza ENCUESTA_INVALIDA', (calificacion) => {
    expect(codigo(() => validarEncuesta(calificacion, null))).toBe('ENCUESTA_INVALIDA');
  });

  it('un comentario de solo espacios pasa a null; uno de 1001 caracteres es inválido', () => {
    expect(validarEncuesta(3, '   ').comentario).toBeNull();
    expect(validarEncuesta(3, 'a'.repeat(1000)).comentario).toHaveLength(1000);
    expect(codigo(() => validarEncuesta(3, 'a'.repeat(1001)))).toBe('ENCUESTA_INVALIDA');
    expect(codigo(() => validarEncuesta(3, 12))).toBe('ENCUESTA_INVALIDA');
  });
});

describe('exigirCalificable', () => {
  it('una queja resuelta o rechazada lanza ENCUESTA_NO_DISPONIBLE', () => {
    expect(codigo(() => exigirCalificable('resuelta', null, CERRADA, 30))).toBe('ENCUESTA_NO_DISPONIBLE');
    expect(codigo(() => exigirCalificable('rechazada', CERRADA, CERRADA, 30))).toBe('ENCUESTA_NO_DISPONIBLE');
  });

  it('en el instante cerradoEn + 30 días todavía se puede; un milisegundo después lanza ENCUESTA_VENCIDA', () => {
    const limite = new Date(CERRADA.getTime() + TREINTA_DIAS);
    expect(venceEncuesta(CERRADA, 30)).toEqual(limite);
    expect(() => exigirCalificable('cerrada', CERRADA, limite, 30)).not.toThrow();
    expect(codigo(() => exigirCalificable('cerrada', CERRADA, new Date(limite.getTime() + 1), 30))).toBe('ENCUESTA_VENCIDA');
  });

  it('esCalificable combina el estado, el plazo y si ya tiene encuesta', () => {
    expect(esCalificable('cerrada', CERRADA, false, CERRADA, 30)).toBe(true);
    expect(esCalificable('cerrada', CERRADA, true, CERRADA, 30)).toBe(false);
    expect(esCalificable('resuelta', null, false, CERRADA, 30)).toBe(false);
    expect(venceEncuesta(null, 30)).toBeNull();
  });
});

describe('parámetros', () => {
  it('el plazo es un entero de 1 a 365 y el umbral, de 0 a 5', () => {
    expect([1, 30, 365].map(plazoEncuestaValido)).toEqual([1, 30, 365]);
    expect([0, 366, 2.5, '30'].map(plazoEncuestaValido)).toEqual([null, null, null, null]);
    expect([0, 2, 5].map(umbralEncuestaValido)).toEqual([0, 2, 5]);
    expect([-1, 6, '2'].map(umbralEncuestaValido)).toEqual([null, null, null]);
  });
});
