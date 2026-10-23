import { describe, expect, it } from 'vitest'
import { camposExtraConError, destinoDeError } from '../../../src/features/tickets/registro/errores-registro'
import tickets from '../../../src/locales/es/tickets.json'

// Tabla "Errores del backend y dónde se muestran" de SPEC 18.
describe('destinoDeError', () => {
  it.each([
    ['CATEGORIA_INVALIDA', { paso: 'categoria', aviso: 'categoriaNoDisponible', efectos: ['recargarCategorias'] }],
    ['DATOS_EXTRA_INVALIDOS', { paso: 'categoria', camposExtra: true }],
    ['TITULO_INVALIDO', { paso: 'descripcion', campo: 'titulo' }],
    ['DESCRIPCION_INVALIDA', { paso: 'descripcion', campo: 'descripcion' }],
    ['ZONA_INVALIDA', { paso: 'ubicacion', campo: 'zonaId' }],
    ['DIRECCION_INVALIDA', { paso: 'ubicacion', campo: 'direccion' }],
    ['UBICACION_FUERA_DEL_MUNICIPIO', { paso: 'ubicacion', campo: 'ubicacion' }],
    ['UBICACION_INCOMPLETA', { paso: 'ubicacion', campo: 'ubicacion' }],
    ['UBICACION_INVALIDA', { paso: 'ubicacion', campo: 'ubicacion' }],
    [
      'UBICACION_NO_CONFIGURADA',
      { paso: 'ubicacion', aviso: 'ubicacionNoConfigurada', efectos: ['recargarLimites', 'quitarUbicacion'] },
    ],
    ['SOLICITANTE_INVALIDO', { paso: 'solicitante', aviso: 'solicitanteInvalido', efectos: ['quitarSolicitante'] }],
    ['EMAIL_DUPLICADO', { paso: 'solicitante', aviso: 'vecinoDuplicado' }],
    ['DPI_DUPLICADO', { paso: 'solicitante', aviso: 'vecinoDuplicado' }],
    ['RED_NO_DISPONIBLE', { paso: 'resumen', aviso: 'red' }],
    ['TIEMPO_AGOTADO', { paso: 'resumen', aviso: 'red' }],
    ['HTTP_500', { paso: 'resumen', aviso: 'generico' }],
    ['VALIDACION', { paso: 'resumen', aviso: 'generico' }],
    ['', { paso: 'resumen', aviso: 'generico' }],
  ])('%s → %j', (codigo, esperado) => {
    expect(destinoDeError(codigo)).toEqual(esperado)
  })

  it('cada código que va a un campo tiene su mensaje en tickets.json', () => {
    const errores: Record<string, string> = tickets.nuevo.errores
    for (const codigo of [
      'TITULO_INVALIDO',
      'DESCRIPCION_INVALIDA',
      'ZONA_INVALIDA',
      'DIRECCION_INVALIDA',
      'UBICACION_FUERA_DEL_MUNICIPIO',
      'UBICACION_INCOMPLETA',
      'UBICACION_INVALIDA',
    ]) {
      expect(destinoDeError(codigo).campo).toBeDefined()
      expect(errores[codigo]).toBeTruthy()
    }
  })

  it('cada aviso tiene su texto en tickets.json', () => {
    const avisos: Record<string, string> = tickets.nuevo.avisos
    for (const codigo of ['CATEGORIA_INVALIDA', 'UBICACION_NO_CONFIGURADA', 'SOLICITANTE_INVALIDO', 'DPI_DUPLICADO', 'RED_NO_DISPONIBLE', 'OTRO']) {
      expect(avisos[destinoDeError(codigo).aviso!]).toBeTruthy()
    }
  })
})

describe('camposExtraConError', () => {
  it('lleva cada detalle a su campo datosExtra.<clave>', () => {
    expect(
      camposExtraConError([
        { campo: 'numero_poste', problema: 'REQUERIDO' },
        { campo: 'hay_cables', problema: 'TIPO_INVALIDO' },
      ]),
    ).toEqual([
      { nombre: 'datosExtra.numero_poste', problema: 'REQUERIDO' },
      { nombre: 'datosExtra.hay_cables', problema: 'TIPO_INVALIDO' },
    ])
  })
})
