import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import {
  type DatosRegistro,
  type UsuarioParaRegistro,
  decidirCasoRegistro,
  esRegistroPendiente,
  validarRegistro,
} from '../../../src/domain/usuarios/registro-vecino';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

const datos: DatosRegistro = {
  nombre: '  María López ',
  dpi: '2547 12345 0101',
  email: ' Maria.Lopez@Correo.GT ',
  telefono: '5555-0000',
  password: 'Abc12345',
};

describe('validarRegistro', () => {
  it('normaliza nombre, DPI, correo y teléfono, y conserva la contraseña', () => {
    expect(validarRegistro(datos)).toEqual({
      nombre: 'María López',
      dpi: '2547123450101',
      email: 'maria.lopez@correo.gt',
      telefono: '55550000',
      password: 'Abc12345',
    });
  });

  it('el teléfono es opcional', () => {
    expect(validarRegistro({ ...datos, telefono: null }).telefono).toBeNull();
  });

  it.each([
    ['sin correo', { email: '' }, 'EMAIL_INVALIDO'],
    ['correo solo con espacios', { email: '   ' }, 'EMAIL_INVALIDO'],
    ['correo inválido', { email: 'maria-correo.gt' }, 'EMAIL_INVALIDO'],
    ['DPI de 12 dígitos', { dpi: '254712345010' }, 'DPI_INVALIDO'],
    ['DPI con letras', { dpi: '2547A2345010X' }, 'DPI_INVALIDO'],
    ['teléfono de 7 dígitos', { telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    ['nombre vacío', { nombre: '   ' }, 'NOMBRE_INVALIDO'],
    ['contraseña corta', { password: 'Abc1234' }, 'POLITICA_PASSWORD'],
    ['contraseña sin número', { password: 'abcdefgh' }, 'POLITICA_PASSWORD'],
    ['contraseña sin letra', { password: '12345678' }, 'POLITICA_PASSWORD'],
  ] as const)('%s → %s', (_caso, cambio, codigo) => {
    expect(codigoDe(() => validarRegistro({ ...datos, ...cambio }))).toBe(codigo);
  });

  it('POLITICA_PASSWORD lleva el motivo de RNF-08 en el mensaje', () => {
    expect(() => validarRegistro({ ...datos, password: 'abcdefgh' })).toThrow('SIN_NUMERO');
  });
});

const pendiente: UsuarioParaRegistro = { id: 10, rol: 'vecino', activo: true, tienePassword: true, verificado: false };
const verificado: UsuarioParaRegistro = { ...pendiente, id: 11, verificado: true };
const ventanilla: UsuarioParaRegistro = { ...pendiente, id: 12, tienePassword: false };
const interno: UsuarioParaRegistro = { id: 13, rol: 'tecnico', activo: true, tienePassword: true, verificado: false };
const inactivo: UsuarioParaRegistro = { ...verificado, id: 14, activo: false };
const otro: UsuarioParaRegistro = { ...verificado, id: 20 };

describe('esRegistroPendiente', () => {
  it('solo un vecino activo, con contraseña y sin verificar', () => {
    expect(esRegistroPendiente(pendiente)).toBe(true);
    expect(esRegistroPendiente(verificado)).toBe(false);
    expect(esRegistroPendiente(ventanilla)).toBe(false);
    expect(esRegistroPendiente(interno)).toBe(false);
    expect(esRegistroPendiente({ ...pendiente, activo: false })).toBe(false);
  });
});

describe('decidirCasoRegistro', () => {
  it('caso 1: ni el correo ni el DPI existen → nuevo', () => {
    expect(decidirCasoRegistro(null, null)).toEqual({ caso: 'nuevo' });
  });

  it('caso 2: el correo es un registro pendiente y el DPI no existe → reemplazar', () => {
    expect(decidirCasoRegistro(pendiente, null)).toEqual({ caso: 'reemplazar_pendiente', usuarioId: 10 });
  });

  it('caso 2: el correo es un registro pendiente y el DPI es del mismo usuario → reemplazar', () => {
    expect(decidirCasoRegistro(pendiente, pendiente)).toEqual({ caso: 'reemplazar_pendiente', usuarioId: 10 });
  });

  it.each([
    ['cuenta verificada', verificado],
    ['vecino de ventanilla sin contraseña', ventanilla],
    ['usuario interno', interno],
  ])('caso 3: el correo es de una %s → cuenta_existente', (_tipo, usuario) => {
    expect(decidirCasoRegistro(usuario, null)).toEqual({ caso: 'cuenta_existente' });
  });

  it('caso 3 gana sobre el DPI: la cuenta existente recibe el aviso aunque el DPI sea de otro', () => {
    expect(decidirCasoRegistro(verificado, otro)).toEqual({ caso: 'cuenta_existente' });
  });

  it('caso 4: el correo no existe y el DPI es de otro usuario → dpi_ajeno', () => {
    expect(decidirCasoRegistro(null, otro)).toEqual({ caso: 'dpi_ajeno' });
  });

  it('caso 4: el correo es un registro pendiente y el DPI es de otro → dpi_ajeno', () => {
    expect(decidirCasoRegistro(pendiente, otro)).toEqual({ caso: 'dpi_ajeno' });
  });

  it('caso 5: el usuario del correo está inactivo → inactivo', () => {
    expect(decidirCasoRegistro(inactivo, null)).toEqual({ caso: 'inactivo' });
    expect(decidirCasoRegistro(inactivo, otro)).toEqual({ caso: 'inactivo' });
  });
});
