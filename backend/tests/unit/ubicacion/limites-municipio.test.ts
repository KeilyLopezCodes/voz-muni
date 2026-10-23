import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import {
  type LimitesMunicipio,
  validarLimites,
  validarUbicacion,
} from '../../../src/domain/ubicacion/limites-municipio';

// Caja de ejemplo de la spec. Es un dato de prueba, no una configuración del sistema.
const EJEMPLO: LimitesMunicipio = { latMin: 14.55, latMax: 14.7, lngMin: -90.6, lngMax: -90.45 };

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('validarLimites', () => {
  it('acepta el ejemplo', () => {
    expect(validarLimites({ ...EJEMPLO })).toEqual(EJEMPLO);
  });

  it.each([
    ['latMin = latMax', { ...EJEMPLO, latMin: 14.7 }],
    ['latMin > latMax', { ...EJEMPLO, latMin: 15 }],
    ['lat fuera de -90..90', { ...EJEMPLO, latMax: 91 }],
    ['lngMin > lngMax', { ...EJEMPLO, lngMin: -90.4 }],
    ['lng fuera de -180..180', { ...EJEMPLO, lngMin: -181 }],
    ['una propiedad faltante', { latMin: 14.55, latMax: 14.7, lngMin: -90.6 }],
    ['una propiedad de más', { ...EJEMPLO, zoom: 12 }],
    ['un valor en texto', { ...EJEMPLO, latMin: '14.55' }],
    ['algo que no es objeto', [14.55, 14.7, -90.6, -90.45]],
    ['null', null],
  ])('%s → LIMITES_INVALIDOS', (_caso, valor) => {
    expect(codigoDe(() => validarLimites(valor))).toBe('LIMITES_INVALIDOS');
  });
});

describe('validarUbicacion', () => {
  it('sin coordenadas devuelve null, con o sin límites', () => {
    expect(validarUbicacion(EJEMPLO, undefined, undefined)).toBeNull();
    expect(validarUbicacion(null, undefined, undefined)).toBeNull();
  });

  it.each([
    ['solo lat', 14.6, undefined, 'UBICACION_INCOMPLETA'],
    ['solo lng', undefined, -90.5, 'UBICACION_INCOMPLETA'],
    ['lat = 91', 91, -90.5, 'UBICACION_INVALIDA'],
    ['lng = -181', 14.6, -181, 'UBICACION_INVALIDA'],
    ['NaN', Number.NaN, -90.5, 'UBICACION_INVALIDA'],
    ['Infinity', 14.6, Number.POSITIVE_INFINITY, 'UBICACION_INVALIDA'],
    ['un punto fuera de la caja', 14.8, -90.5, 'UBICACION_FUERA_DEL_MUNICIPIO'],
  ])('%s → %s', (_caso, lat, lng, codigo) => {
    expect(codigoDe(() => validarUbicacion(EJEMPLO, lat, lng))).toBe(codigo);
  });

  it('con coordenadas y sin límites configurados → UBICACION_NO_CONFIGURADA', () => {
    expect(codigoDe(() => validarUbicacion(null, 14.6, -90.5))).toBe('UBICACION_NO_CONFIGURADA');
  });

  it('una coordenada incompleta o inválida se informa antes que la falta de configuración', () => {
    expect(codigoDe(() => validarUbicacion(null, 14.6, undefined))).toBe('UBICACION_INCOMPLETA');
    expect(codigoDe(() => validarUbicacion(null, 95, -90.5))).toBe('UBICACION_INVALIDA');
  });

  it('los bordes de la caja cuentan como dentro', () => {
    expect(validarUbicacion(EJEMPLO, 14.55, -90.6)).toEqual({ lat: 14.55, lng: -90.6 });
    expect(validarUbicacion(EJEMPLO, 14.7, -90.45)).toEqual({ lat: 14.7, lng: -90.45 });
  });

  it('redondea a 6 decimales', () => {
    expect(validarUbicacion(EJEMPLO, 14.6012345, -90.5000004)).toEqual({ lat: 14.601235, lng: -90.5 });
  });
});
