import { describe, expect, it } from 'vitest'
import { validarDpi, validarEmail, validarTelefono } from '../../src/shared/validacion/datos-personales'

// Mismos casos que las reglas del backend (SPEC 13 y 16).
describe('datos-personales', () => {
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
})
