import { esAccionAtencion, puedeAtender } from '../../../src/domain/atencion/acciones-atencion';
import { ALCANCES } from '../../../src/domain/auth/permisos';

describe('puedeAtender', () => {
  it.each(ALCANCES)('%s', (alcance) => {
    expect(puedeAtender(alcance)).toBe(['asignadas', 'dependencia', 'todas'].includes(alcance));
  });

  it('sin el permiso (undefined) no puede', () => {
    expect(puedeAtender(undefined)).toBe(false);
  });
});

describe('esAccionAtencion', () => {
  it.each(['iniciar', 'poner_en_espera', 'reanudar', 'resolver'])('%s es de atención', (accion) => {
    expect(esAccionAtencion(accion)).toBe(true);
  });

  it.each(['tomar', 'aceptar', 'rechazar', 'cerrar'])('%s no es de atención', (accion) => {
    expect(esAccionAtencion(accion)).toBe(false);
  });
});
