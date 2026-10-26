import {
  cumplimientoResolucion,
  cumplimientoRespuesta,
  type PlazoResolucion,
  type PlazoRespuesta,
  porcentaje,
} from '../../../src/domain/reportes/cumplimiento';

const AHORA = new Date('2026-11-10T15:00:00.000Z');
const ANTES = new Date('2026-11-09T15:00:00.000Z');
const DESPUES = new Date('2026-11-11T15:00:00.000Z');
const ANTES_AUN = new Date('2026-11-08T15:00:00.000Z');

const respuesta = (cambios: Partial<PlazoRespuesta>): PlazoRespuesta => ({
  venceRespuesta: ANTES,
  primeraRespuestaEn: null,
  estado: 'en_proceso',
  ...cambios,
});

const resolucion = (cambios: Partial<PlazoResolucion>): PlazoResolucion => ({
  venceResolucion: DESPUES,
  resueltoEn: null,
  estado: 'en_proceso',
  slaPausadoDesde: null,
  slaRestanteMinutos: null,
  ...cambios,
});

describe('cumplimientoRespuesta (SPEC 43)', () => {
  it.each<[string, Partial<PlazoRespuesta>, string]>([
    ['sin vencimiento → no_aplica', { venceRespuesta: null, estado: 'nueva' }, 'no_aplica'],
    ['respondida a tiempo → cumple', { primeraRespuestaEn: ANTES_AUN }, 'cumple'],
    ['respondida en el instante del vencimiento → cumple', { primeraRespuestaEn: ANTES }, 'cumple'],
    ['respondida tarde → incumple', { primeraRespuestaEn: AHORA }, 'incumple'],
    ['sin respuesta y ya vencida → incumple', { primeraRespuestaEn: null }, 'incumple'],
    ['sin respuesta dentro del plazo → pendiente', { venceRespuesta: DESPUES }, 'pendiente'],
  ])('%s', (_caso, cambios, esperado) => {
    expect(cumplimientoRespuesta(respuesta(cambios), AHORA)).toBe(esperado);
  });
});

describe('cumplimientoResolucion (SPEC 43)', () => {
  it.each<[string, Partial<PlazoResolucion>, string]>([
    ['rechazada → no_aplica', { estado: 'rechazada', venceResolucion: ANTES }, 'no_aplica'],
    ['nunca tuvo vencimiento → no_aplica', { venceResolucion: null, estado: 'asignada' }, 'no_aplica'],
    ['resuelta a tiempo → cumple', { estado: 'resuelta', resueltoEn: ANTES, venceResolucion: AHORA }, 'cumple'],
    ['cerrada a tiempo → cumple', { estado: 'cerrada', resueltoEn: ANTES, venceResolucion: ANTES }, 'cumple'],
    ['resuelta tarde → incumple', { estado: 'resuelta', resueltoEn: AHORA, venceResolucion: ANTES }, 'incumple'],
    ['abierta ya vencida → incumple', { estado: 'en_proceso', venceResolucion: ANTES }, 'incumple'],
    ['en espera sin minutos restantes → incumple', { estado: 'en_espera', venceResolucion: null, slaPausadoDesde: ANTES, slaRestanteMinutos: 0 }, 'incumple'],
    ['abierta dentro del plazo → pendiente', { estado: 'asignada', venceResolucion: DESPUES }, 'pendiente'],
    ['en espera con minutos restantes → pendiente', { estado: 'en_espera', venceResolucion: null, slaPausadoDesde: ANTES, slaRestanteMinutos: 30 }, 'pendiente'],
  ])('%s', (_caso, cambios, esperado) => {
    expect(cumplimientoResolucion(resolucion(cambios), AHORA)).toBe(esperado);
  });
});

describe('porcentaje', () => {
  it('sin medibles es null, y redondea a 1 decimal', () => {
    expect(porcentaje(0, 0)).toBeNull();
    expect(porcentaje(2, 1)).toBe(66.7);
    expect(porcentaje(3, 0)).toBe(100);
    expect(porcentaje(0, 4)).toBe(0);
  });
});
