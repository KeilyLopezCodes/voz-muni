import { describe, expect, it } from 'vitest'
import {
  validarConfirmacion,
  validarDpi,
  validarEmail,
  validarNombre,
  validarPassword,
  validarTelefono,
} from '../../src/features/auth/validacion-registro'

// Mismos casos que las reglas del backend (SPEC 13 y 16, RNF-08).
describe('validacion-registro', () => {
  it.each([
    ['María López', null],
    ['  María  ', null],
    ['   ', 'NOMBRE_INVALIDO'],
    ['', 'NOMBRE_INVALIDO'],
    ['a'.repeat(150), null],
    ['a'.repeat(151), 'NOMBRE_INVALIDO'],
    ['ñ'.repeat(150), null],
  ])('nombre %j → %s', (nombre, esperado) => {
    expect(validarNombre(nombre)).toBe(esperado)
  })

  it.each([
    ['2547123450101', null],
    ['2547 12345 0101', null],
    ['254712345010', 'DPI_INVALIDO'],
    ['25471234501011', 'DPI_INVALIDO'],
    ['2547-12345-0101', 'DPI_INVALIDO'],
    ['254712345010a', 'DPI_INVALIDO'],
    ['', 'DPI_INVALIDO'],
  ])('DPI %j → %s', (dpi, esperado) => {
    expect(validarDpi(dpi)).toBe(esperado)
  })

  it.each([
    ['maria@correo.gt', null],
    [' Maria@Correo.GT ', null],
    ['no-es-correo', 'EMAIL_INVALIDO'],
    ['maria@correo', 'EMAIL_INVALIDO'],
    ['ma ria@correo.gt', 'EMAIL_INVALIDO'],
    ['', 'EMAIL_INVALIDO'],
  ])('correo %j → %s', (email, esperado) => {
    expect(validarEmail(email)).toBe(esperado)
  })

  it.each([
    ['', null],
    ['   ', null],
    ['55550000', null],
    ['5555-0000', null],
    ['5555 0000', null],
    ['5555000', 'TELEFONO_INVALIDO'],
    ['555500001', 'TELEFONO_INVALIDO'],
    ['+50255550000', 'TELEFONO_INVALIDO'],
  ])('teléfono %j → %s', (telefono, esperado) => {
    expect(validarTelefono(telefono)).toBe(esperado)
  })

  it.each([
    ['Clave2026', null],
    ['ñandú123', null],
    ['Abc1234', 'MUY_CORTA'],
    ['a1'.repeat(100), null],
    ['a1'.repeat(100) + 'x', 'MUY_LARGA'],
    ['12345678', 'SIN_LETRA'],
    ['abcdefgh', 'SIN_NUMERO'],
    ['        ', 'SIN_LETRA'],
  ])('contraseña %j → %s', (password, esperado) => {
    expect(validarPassword(password)).toBe(esperado)
  })

  it('la confirmación debe ser idéntica, sin recortar', () => {
    expect(validarConfirmacion('Clave2026', 'Clave2026')).toBeNull()
    expect(validarConfirmacion('Clave2026', 'Clave2026 ')).toBe('CONFIRMACION_DISTINTA')
  })
})
