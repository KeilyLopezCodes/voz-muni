import { exigeMotivoAlConfirmar, puedeConfirmar } from '../../../src/domain/atencion/acciones-confirmacion';
import { ALCANCES } from '../../../src/domain/auth/permisos';

describe('puedeConfirmar', () => {
  it.each(ALCANCES)('%s', (alcance) => {
    expect(puedeConfirmar(alcance)).toBe(['propia', 'dependencia', 'todas'].includes(alcance));
  });

  it('el técnico (asignadas) no puede', () => {
    expect(puedeConfirmar('asignadas')).toBe(false);
  });

  it('sin el permiso (undefined) no puede', () => {
    expect(puedeConfirmar(undefined)).toBe(false);
  });
});

describe('exigeMotivoAlConfirmar', () => {
  it.each(ALCANCES)('%s', (alcance) => {
    expect(exigeMotivoAlConfirmar(alcance)).toBe(alcance !== 'propia');
  });
});
