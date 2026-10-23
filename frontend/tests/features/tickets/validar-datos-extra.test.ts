import { describe, expect, it } from 'vitest'
import type { CampoExtra } from '../../../src/features/tickets/api/registro-api'
import {
  datosExtraParaEnvio,
  hoyGuatemala,
  ordenarCampos,
  validarCampoExtra,
} from '../../../src/features/tickets/registro/validar-datos-extra'

const HOY = '2026-10-23'
const base = { etiqueta: 'Campo', requerido: false, orden: 0 }

const texto: CampoExtra = { ...base, clave: 'placa', tipo: 'texto', min: 3, max: 8, patron: '^[A-Z]{1,3}[0-9]{3}$' }
const numero: CampoExtra = { ...base, clave: 'cantidad', tipo: 'numero', min: 1, max: 10, entero: true }
const decimal: CampoExtra = { ...base, clave: 'metros', tipo: 'numero', entero: false }
const fecha: CampoExtra = { ...base, clave: 'desde', tipo: 'fecha', min: '2026-01-01', noFutura: true }
const seleccion: CampoExtra = {
  ...base,
  clave: 'tipo_poste',
  tipo: 'seleccion',
  opciones: [
    { valor: 'madera', etiqueta: 'Madera' },
    { valor: 'concreto', etiqueta: 'Concreto' },
  ],
}
const siNo: CampoExtra = { ...base, clave: 'hay_heridos', tipo: 'si_no' }

describe('validarCampoExtra', () => {
  it.each([
    [texto, '', null],
    [texto, '   ', null],
    [{ ...texto, requerido: true }, '   ', 'REQUERIDO'],
    [{ ...siNo, requerido: true }, undefined, 'REQUERIDO'],
    [{ ...siNo, requerido: true }, false, null],
  ] as const)('ausente: %j con %j → %s', (campo, valor, esperado) => {
    expect(validarCampoExtra(campo, valor, HOY)).toBe(esperado)
  })

  it.each([
    [' P123 ', null],
    ['P1', 'MUY_CORTO'],
    ['PPP123456', 'MUY_LARGO'],
    ['p123', 'PATRON'],
    ['1234', 'PATRON'],
  ])('texto %j → %s', (valor, esperado) => {
    expect(validarCampoExtra(texto, valor, HOY)).toBe(esperado)
  })

  it.each([
    ['3', null],
    [' 10 ', null],
    ['0', 'MENOR_AL_MINIMO'],
    ['11', 'MAYOR_AL_MAXIMO'],
    ['2.5', 'NO_ENTERO'],
    ['abc', 'TIPO_INVALIDO'],
    ['1e3', 'TIPO_INVALIDO'],
  ])('número entero %j → %s', (valor, esperado) => {
    expect(validarCampoExtra(numero, valor, HOY)).toBe(esperado)
  })

  it.each([
    ['2,5', null],
    ['-1.25', null],
    ['2,', 'TIPO_INVALIDO'],
  ])('número decimal %j → %s', (valor, esperado) => {
    expect(validarCampoExtra(decimal, valor, HOY)).toBe(esperado)
  })

  it.each([
    ['2026-10-23', null],
    ['2026-10-24', 'FECHA_FUTURA'],
    ['2025-12-31', 'MENOR_AL_MINIMO'],
    ['2026-02-30', 'TIPO_INVALIDO'],
    ['23/10/2026', 'TIPO_INVALIDO'],
  ])('fecha %j → %s', (valor, esperado) => {
    expect(validarCampoExtra(fecha, valor, HOY)).toBe(esperado)
  })

  it('selección: solo las opciones de la definición', () => {
    expect(validarCampoExtra(seleccion, 'madera', HOY)).toBeNull()
    expect(validarCampoExtra(seleccion, 'metal', HOY)).toBe('OPCION_INVALIDA')
  })

  it('sí/no: solo booleanos', () => {
    expect(validarCampoExtra(siNo, true, HOY)).toBeNull()
    expect(validarCampoExtra(siNo, 'true', HOY)).toBe('TIPO_INVALIDO')
  })
})

describe('datosExtraParaEnvio', () => {
  it('envía números como number, sí/no como boolean, recorta textos y omite los ausentes', () => {
    const campos = [texto, numero, decimal, fecha, seleccion, siNo]
    expect(
      datosExtraParaEnvio(campos, {
        placa: ' P123 ',
        cantidad: '3',
        metros: '2,5',
        desde: '',
        tipo_poste: 'madera',
        hay_heridos: false,
      }),
    ).toEqual({ placa: 'P123', cantidad: 3, metros: 2.5, tipo_poste: 'madera', hay_heridos: false })
  })

  it('ignora claves que no son de la categoría', () => {
    expect(datosExtraParaEnvio([texto], { placa: 'P123', otra: 'x' })).toEqual({ placa: 'P123' })
  })
})

describe('hoyGuatemala', () => {
  it('usa la fecha de Guatemala (UTC-6), no la de UTC', () => {
    expect(hoyGuatemala(new Date('2026-10-24T05:59:00Z'))).toBe('2026-10-23')
    expect(hoyGuatemala(new Date('2026-10-24T06:00:00Z'))).toBe('2026-10-24')
  })
})

describe('ordenarCampos', () => {
  it('ordena por orden y luego por clave', () => {
    const campos = [
      { ...siNo, clave: 'b', orden: 1 },
      { ...siNo, clave: 'c', orden: 0 },
      { ...siNo, clave: 'a', orden: 1 },
    ]
    expect(ordenarCampos(campos).map((campo) => campo.clave)).toEqual(['c', 'a', 'b'])
  })
})
