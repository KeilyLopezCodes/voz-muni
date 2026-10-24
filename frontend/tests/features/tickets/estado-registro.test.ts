import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, pasosPara } from '../../../src/features/tickets/registro/estado-registro'

describe('pasosPara', () => {
  it('el vecino tiene 4 pasos, sin solicitante', () => {
    expect(pasosPara('vecino')).toEqual(['categoria', 'descripcion', 'ubicacion', 'resumen'])
  })

  it.each(['receptor', 'supervisor'] as const)('%s empieza por solicitante y tiene 5 pasos', (rol) => {
    expect(pasosPara(rol)).toEqual(['solicitante', 'categoria', 'descripcion', 'ubicacion', 'resumen'])
  })

  it('devuelve una lista nueva en cada llamada', () => {
    const pasos = pasosPara('vecino')
    pasos.pop()
    expect(pasosPara('vecino')).toHaveLength(4)
  })
})

describe('ESTADO_INICIAL', () => {
  it('empieza vacío', () => {
    expect(ESTADO_INICIAL).toEqual({
      solicitante: null,
      canal: null,
      categoriaId: null,
      datosExtra: {},
      titulo: '',
      descripcion: '',
      zonaId: null,
      direccion: '',
      ubicacion: null,
      archivos: [],
    })
  })
})
