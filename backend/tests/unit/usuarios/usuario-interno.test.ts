import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import {
  esRolInterno,
  normalizarDpi,
  type ProteccionAdmin,
  ROLES_INTERNOS,
  validarAsignacion,
  verificarProteccionAdmin,
} from '../../../src/domain/usuarios/usuario-interno';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('esRolInterno', () => {
  it('acepta los 5 roles internos y rechaza vecino y valores desconocidos', () => {
    expect(ROLES_INTERNOS.every(esRolInterno)).toBe(true);
    expect(esRolInterno('vecino')).toBe(false);
    expect(esRolInterno('root')).toBe(false);
  });
});

describe('validarAsignacion', () => {
  it.each([
    ['tecnico', null, 'DEPENDENCIA_REQUERIDA'],
    ['coordinador', null, 'DEPENDENCIA_REQUERIDA'],
    ['supervisor', 3, 'DEPENDENCIA_NO_PERMITIDA'],
    ['receptor', 3, 'DEPENDENCIA_NO_PERMITIDA'],
    ['administrador', 3, 'DEPENDENCIA_NO_PERMITIDA'],
    ['coordinador', 3, null],
    ['tecnico', 3, null],
    ['supervisor', null, null],
  ] as const)('%s con dependencia %s → %s', (rol, dependenciaId, esperado) => {
    expect(codigoDe(() => validarAsignacion(rol, dependenciaId))).toBe(esperado);
  });
});

describe('normalizarDpi', () => {
  it('quita los espacios y devuelve los 13 dígitos', () => {
    expect(normalizarDpi('2547 12345 0101')).toBe('2547123450101');
    expect(normalizarDpi('2547123450101')).toBe('2547123450101');
  });

  it.each(['254712345010', '25471234501012', '2547A23450101', ''])('rechaza %p con DPI_INVALIDO', (dpi) => {
    expect(codigoDe(() => normalizarDpi(dpi))).toBe('DPI_INVALIDO');
  });
});

describe('verificarProteccionAdmin', () => {
  const desactivarAdmin: ProteccionAdmin = {
    actorId: 1,
    objetivoId: 2,
    objetivoEsAdminActivo: true,
    quedaraAdminActivo: false,
    adminsActivos: 2,
  };

  it('desactivarse a sí mismo → OPERACION_SOBRE_SI_MISMO', () => {
    expect(codigoDe(() => verificarProteccionAdmin({ ...desactivarAdmin, objetivoId: 1 }))).toBe('OPERACION_SOBRE_SI_MISMO');
  });

  it('desactivar al único administrador activo → ULTIMO_ADMINISTRADOR', () => {
    expect(codigoDe(() => verificarProteccionAdmin({ ...desactivarAdmin, adminsActivos: 1 }))).toBe('ULTIMO_ADMINISTRADOR');
  });

  it('desactivar a otro administrador con 2 activos es válido', () => {
    expect(codigoDe(() => verificarProteccionAdmin(desactivarAdmin))).toBeNull();
  });

  it('quitarse a sí mismo el rol administrador → OPERACION_SOBRE_SI_MISMO', () => {
    expect(codigoDe(() => verificarProteccionAdmin({ ...desactivarAdmin, objetivoId: 1, adminsActivos: 3 }))).toBe(
      'OPERACION_SOBRE_SI_MISMO',
    );
  });

  it('no aplica si el objetivo no es administrador activo o lo sigue siendo', () => {
    expect(codigoDe(() => verificarProteccionAdmin({ ...desactivarAdmin, objetivoEsAdminActivo: false, adminsActivos: 1 }))).toBeNull();
    expect(
      codigoDe(() => verificarProteccionAdmin({ ...desactivarAdmin, objetivoId: 1, quedaraAdminActivo: true, adminsActivos: 1 })),
    ).toBeNull();
  });
});
