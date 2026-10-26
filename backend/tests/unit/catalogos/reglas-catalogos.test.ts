import { exigirActivable, exigirDependenciaActiva } from '../../../src/domain/catalogos/categoria';
import { exigirDesactivable } from '../../../src/domain/catalogos/dependencia';
import { normalizarNombre } from '../../../src/domain/catalogos/nombre';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

function error(fn: () => unknown): ReglaDeNegocioError | null {
  try {
    fn();
  } catch (e) {
    return e as ReglaDeNegocioError;
  }
  return null;
}

describe('normalizarNombre', () => {
  it('recorta y colapsa los espacios internos', () => {
    expect(normalizarNombre('  Agua   potable ')).toBe('Agua potable');
    expect(normalizarNombre('Zona\t1')).toBe('Zona 1');
  });

  it('un nombre vacío o de 121 caracteres lanza NOMBRE_INVALIDO; 120 es válido', () => {
    expect(error(() => normalizarNombre('   '))?.codigo).toBe('NOMBRE_INVALIDO');
    expect(error(() => normalizarNombre('a'.repeat(121)))?.codigo).toBe('NOMBRE_INVALIDO');
    expect(normalizarNombre('a'.repeat(120))).toHaveLength(120);
  });
});

describe('exigirDesactivable', () => {
  it('con 2 categorías activas lanza DEPENDENCIA_EN_USO con las dos en los detalles', () => {
    const e = error(() =>
      exigirDesactivable([
        { id: 1, nombre: 'Baches' },
        { id: 2, nombre: 'Banquetas' },
      ]),
    );
    expect(e?.codigo).toBe('DEPENDENCIA_EN_USO');
    expect(e?.detalles).toEqual([
      { id: 1, nombre: 'Baches' },
      { id: 2, nombre: 'Banquetas' },
    ]);
  });

  it('sin categorías activas no lanza', () => {
    expect(() => exigirDesactivable([])).not.toThrow();
  });
});

describe('exigirActivable', () => {
  it('sin SLA completo lanza SLA_INCOMPLETO; con la dependencia inactiva, DEPENDENCIA_INACTIVA', () => {
    expect(error(() => exigirActivable(false, true))?.codigo).toBe('SLA_INCOMPLETO');
    expect(error(() => exigirActivable(true, false))?.codigo).toBe('DEPENDENCIA_INACTIVA');
    expect(error(() => exigirActivable(false, false))?.codigo).toBe('DEPENDENCIA_INACTIVA');
    expect(() => exigirActivable(true, true)).not.toThrow();
  });

  it('exigirDependenciaActiva solo deja pasar una dependencia activa', () => {
    expect(error(() => exigirDependenciaActiva(false))?.codigo).toBe('DEPENDENCIA_INACTIVA');
    expect(() => exigirDependenciaActiva(true)).not.toThrow();
  });
});
