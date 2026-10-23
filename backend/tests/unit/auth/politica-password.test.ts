import { PASSWORD_MAX, PASSWORD_MIN, validarPassword } from '../../../src/domain/auth/politica-password';

describe('validarPassword (RNF-08)', () => {
  it('usa un mínimo de 8 y un máximo de 200 caracteres', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(PASSWORD_MAX).toBe(200);
  });

  it.each([
    ['Abc12345', null],
    ['Abc1234', 'MUY_CORTA'],
    ['12345678', 'SIN_LETRA'],
    ['abcdefgh', 'SIN_NUMERO'],
    [`a1${'x'.repeat(199)}`, 'MUY_LARGA'],
    ['Contraseña1', null],
  ])('%s → %s', (password, esperado) => {
    expect(validarPassword(password)).toBe(esperado);
  });

  it('acepta exactamente 200 caracteres', () => {
    expect(validarPassword(`a1${'x'.repeat(198)}`)).toBeNull();
  });

  it('cuenta caracteres, no unidades de UTF-16, y no recorta espacios', () => {
    expect(validarPassword('ñ1🙂🙂🙂🙂🙂')).toBe('MUY_CORTA');
    expect(validarPassword('ñ1🙂🙂🙂🙂🙂🙂')).toBeNull();
    expect(validarPassword('  ab12  ')).toBeNull();
  });

  it('la ñ y las tildes cuentan como letra', () => {
    expect(validarPassword('ñññññññ1')).toBeNull();
    expect(validarPassword('áéíóú123')).toBeNull();
  });
});
