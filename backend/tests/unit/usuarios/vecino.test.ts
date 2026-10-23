import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { type DatosVecinoNuevo, normalizarTelefono, validarVecinoNuevo } from '../../../src/domain/usuarios/vecino';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

const datos: DatosVecinoNuevo = {
  nombre: 'María López',
  dpi: '2547 12345 0101',
  email: 'Maria.Lopez@Correo.GT',
  telefono: '5555-0000',
};

describe('normalizarTelefono', () => {
  it.each(['5555-0000', '5555 0000', '55550000', ' 5555 - 0000 '])('%p → 55550000', (telefono) => {
    expect(normalizarTelefono(telefono)).toBe('55550000');
  });

  it.each(['5555000', '555500001', '5555-00AB', '+50255550000', ''])('%p → TELEFONO_INVALIDO', (telefono) => {
    expect(codigoDe(() => normalizarTelefono(telefono))).toBe('TELEFONO_INVALIDO');
  });
});

describe('validarVecinoNuevo', () => {
  it('recorta el nombre y normaliza DPI, teléfono y correo (minúsculas)', () => {
    expect(validarVecinoNuevo({ ...datos, nombre: '  María López  ' })).toEqual({
      nombre: 'María López',
      dpi: '2547123450101',
      email: 'maria.lopez@correo.gt',
      telefono: '55550000',
    });
  });

  it('acepta solo correo o solo teléfono', () => {
    expect(validarVecinoNuevo({ ...datos, telefono: null }).telefono).toBeNull();
    expect(validarVecinoNuevo({ ...datos, email: null }).email).toBeNull();
  });

  it('sin correo ni teléfono → CONTACTO_REQUERIDO', () => {
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, email: null, telefono: null }))).toBe('CONTACTO_REQUERIDO');
  });

  it('sin DPI o con DPI inválido → DPI_INVALIDO', () => {
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, dpi: '' }))).toBe('DPI_INVALIDO');
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, dpi: '123' }))).toBe('DPI_INVALIDO');
  });

  it('un nombre solo con espacios o de más de 150 caracteres → NOMBRE_INVALIDO', () => {
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, nombre: '    ' }))).toBe('NOMBRE_INVALIDO');
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, nombre: 'x'.repeat(151) }))).toBe('NOMBRE_INVALIDO');
  });

  it('un teléfono inválido → TELEFONO_INVALIDO y un correo inválido → EMAIL_INVALIDO', () => {
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, telefono: '123' }))).toBe('TELEFONO_INVALIDO');
    expect(codigoDe(() => validarVecinoNuevo({ ...datos, email: 'sin-arroba' }))).toBe('EMAIL_INVALIDO');
  });
});
