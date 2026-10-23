import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import {
  type DatosRegistroVecino,
  decidirCasoRegistro,
  type UsuarioParaRegistro,
  validarRegistro,
} from '../../../src/domain/usuarios/registro-vecino';

const datos: DatosRegistroVecino = {
  nombre: '  Ana López ',
  dpi: '2547 12345 0101',
  email: 'Ana@Correo.GT',
  telefono: '5555-0000',
  password: 'Clave-2026',
};

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('validarRegistro', () => {
  it('normaliza nombre, DPI, correo y teléfono, y conserva la contraseña', () => {
    expect(validarRegistro(datos)).toEqual({
      nombre: 'Ana López',
      dpi: '2547123450101',
      email: 'ana@correo.gt',
      telefono: '55550000',
      password: 'Clave-2026',
    });
  });

  it('el teléfono es opcional', () => {
    expect(validarRegistro({ ...datos, telefono: null }).telefono).toBeNull();
  });

  it.each([
    [{ email: '' }, 'EMAIL_INVALIDO'],
    [{ email: 'sin-arroba' }, 'EMAIL_INVALIDO'],
    [{ dpi: '254712345010' }, 'DPI_INVALIDO'],
    [{ nombre: '   ' }, 'NOMBRE_INVALIDO'],
    [{ telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    [{ password: 'abcdefgh' }, 'POLITICA_PASSWORD'],
    [{ password: 'Abc1234' }, 'POLITICA_PASSWORD'],
  ])('%o → %s', (cambios, codigo) => {
    expect(codigoDe(() => validarRegistro({ ...datos, ...cambios }))).toBe(codigo);
  });
});

describe('decidirCasoRegistro', () => {
  const usuario = (cambios: Partial<UsuarioParaRegistro>): UsuarioParaRegistro => ({
    id: 1,
    rol: 'vecino',
    activo: true,
    tienePassword: true,
    verificado: true,
    ...cambios,
  });
  const pendiente = usuario({ id: 1, verificado: false });
  const otro = usuario({ id: 2 });

  it.each<[string, UsuarioParaRegistro | null, UsuarioParaRegistro | null, number]>([
    ['1: correo y DPI nuevos', null, null, 1],
    ['2: registro pendiente con DPI nuevo', pendiente, null, 2],
    ['2: registro pendiente con su mismo DPI', pendiente, pendiente, 2],
    ['3: cuenta verificada', usuario({}), null, 3],
    ['3: vecino de ventanilla sin contraseña', usuario({ tienePassword: false, verificado: false }), null, 3],
    ['3: usuario interno', usuario({ rol: 'tecnico', verificado: false }), null, 3],
    ['3: cuenta verificada aunque el DPI sea de otro', usuario({}), otro, 3],
    ['4: correo nuevo con DPI de otro', null, otro, 4],
    ['4: registro pendiente con DPI de otro', pendiente, otro, 4],
    ['5: usuario del correo inactivo', usuario({ activo: false }), null, 5],
    ['5: registro pendiente inactivo', usuario({ activo: false, verificado: false }), otro, 5],
  ])('%s', (_caso, porCorreo, porDpi, esperado) => {
    expect(decidirCasoRegistro(porCorreo, porDpi)).toBe(esperado);
  });
});
