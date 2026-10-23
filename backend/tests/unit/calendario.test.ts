import { ASUETOS_2026_2027 } from '../../src/infrastructure/database/seed-helpers/asuetos-guatemala';
import { generarCalendario } from '../../src/infrastructure/database/seed-helpers/calendario';

const filas = generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027);

function fila(fecha: string) {
  return filas.find((f) => f.fecha === fecha);
}

function habilesDe(anio: string): number {
  return filas.filter((f) => f.fecha.startsWith(anio) && f.es_habil).length;
}

describe('generarCalendario', () => {
  it('produce una fila por día de 2026 y 2027', () => {
    expect(filas).toHaveLength(730);
    expect(filas[0].fecha).toBe('2026-01-01');
    expect(filas[729].fecha).toBe('2027-12-31');
  });

  it('cuenta 253 días hábiles en 2026 y 254 en 2027', () => {
    expect(habilesDe('2026')).toBe(253);
    expect(habilesDe('2027')).toBe(254);
  });

  it('marca un asueto completo como no hábil con su descripción', () => {
    expect(fila('2026-04-03')).toEqual({ fecha: '2026-04-03', es_habil: false, descripcion: 'Viernes Santo' });
  });

  it('deja hábil un asueto de mediodía con su descripción', () => {
    expect(fila('2026-12-24')).toEqual({
      fecha: '2026-12-24',
      es_habil: true,
      descripcion: 'Nochebuena (asueto desde mediodía)',
    });
  });

  it('marca el sábado como no hábil sin descripción', () => {
    expect(fila('2026-10-24')).toEqual({ fecha: '2026-10-24', es_habil: false, descripcion: null });
  });

  it('marca un jueves sin asueto como hábil', () => {
    expect(fila('2026-10-22')).toEqual({ fecha: '2026-10-22', es_habil: true, descripcion: null });
  });
});
