import { describe, expect, it } from 'vitest'
import {
  CAMPO_POR_CODIGO,
  ERROR_SERVIDOR_POR_CAMPO,
  validarConfirmacion,
  validarDpi,
  validarEmail,
  validarNombre,
  validarPassword,
  validarTelefono,
} from '../../src/features/auth/validacion-registro'
import i18n from '../../src/shared/i18n/i18n'

describe('validacion-registro', () => {
  it.each([
    ['nombre vacío', validarNombre('   '), 'auth:registro.errores.nombre'],
    ['nombre de 151 caracteres', validarNombre('a'.repeat(151)), 'auth:registro.errores.nombre'],
    ['nombre válido', validarNombre('  Ana López '), null],
    ['DPI de 12 dígitos', validarDpi('254712345010'), 'auth:registro.errores.dpi'],
    ['DPI con letras', validarDpi('25471234501a1'), 'auth:registro.errores.dpi'],
    ['DPI con espacios', validarDpi('2547 12345 0101'), null],
    ['correo sin arroba', validarEmail('sin-arroba'), 'auth:registro.errores.email'],
    ['correo válido', validarEmail('ana@correo.gt'), null],
    ['teléfono de 7 dígitos', validarTelefono('5555000'), 'auth:registro.errores.telefono'],
    ['teléfono con guion', validarTelefono('5555-0000'), null],
    ['teléfono vacío (opcional)', validarTelefono(''), null],
    ['contraseña de 7 caracteres', validarPassword('abc1234'), 'auth:registro.errores.passwordCorta'],
    ['contraseña de 201 caracteres', validarPassword('a1'.repeat(100) + 'b'), 'auth:registro.errores.passwordLarga'],
    ['contraseña sin número', validarPassword('abcdefgh'), 'auth:registro.errores.passwordSinNumero'],
    ['contraseña sin letra', validarPassword('12345678'), 'auth:registro.errores.passwordSinLetra'],
    ['contraseña con ñ y número', validarPassword('ñandú2026'), null],
    ['confirmación distinta', validarConfirmacion('Clave-1234', 'Clave-12345'), 'auth:registro.errores.confirmacion'],
    ['confirmación igual', validarConfirmacion('Clave-1234', 'Clave-1234'), null],
  ])('%s', (_caso, resultado, esperado) => {
    expect(resultado).toBe(esperado)
  })

  it('cada clave de error tiene su texto traducido', () => {
    const claves = [
      validarNombre(''),
      validarDpi(''),
      validarEmail(''),
      validarTelefono('1'),
      validarPassword(''),
      validarPassword('a'.repeat(201)),
      validarPassword('12345678'),
      validarPassword('abcdefgh'),
      validarConfirmacion('a', 'b'),
      ...Object.values(ERROR_SERVIDOR_POR_CAMPO),
    ]
    for (const clave of claves) {
      expect(clave).not.toBeNull()
      expect(i18n.exists(clave!)).toBe(true)
    }
  })

  it('cada código 400 del servidor tiene su campo', () => {
    expect(CAMPO_POR_CODIGO).toEqual({
      NOMBRE_INVALIDO: 'nombre',
      DPI_INVALIDO: 'dpi',
      EMAIL_INVALIDO: 'email',
      TELEFONO_INVALIDO: 'telefono',
      POLITICA_PASSWORD: 'password',
    })
  })
})
