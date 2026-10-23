import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import type { CampoExtra, ValorExtra } from '../../../src/features/tickets/api/registro-api'
import { CampoExtraInput } from '../../../src/features/tickets/registro/campos-extra/CampoExtraInput'
import { ESTADO_INICIAL, type EstadoRegistro } from '../../../src/features/tickets/registro/estado-registro'
import { datosExtraParaEnvio } from '../../../src/features/tickets/registro/validar-datos-extra'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'

const { camposExtra } = tickets.nuevo
const HOY = '2026-10-23'
const base = { requerido: false, orden: 0 }

// Monta un campo en un formulario y, al validar, deja en `enviado` el datosExtra que saldría a la API.
function montar(campo: CampoExtra) {
  const resultado: { enviado?: Record<string, ValorExtra>; valido?: boolean } = {}
  function Prueba() {
    const metodos = useForm<EstadoRegistro>({ defaultValues: ESTADO_INICIAL })
    return (
      <FormProvider {...metodos}>
        <CampoExtraInput campo={campo} hoy={HOY} />
        <button
          type="button"
          onClick={async () => {
            resultado.valido = await metodos.trigger('datosExtra')
            resultado.enviado = datosExtraParaEnvio([campo], metodos.getValues('datosExtra'))
          }}
        >
          validar
        </button>
      </FormProvider>
    )
  }
  render(<Prueba />)
  const validar = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'validar' }))
    await waitFor(() => expect(resultado.valido).not.toBeUndefined())
    return resultado
  }
  return validar
}

describe('CampoExtraInput', () => {
  it('texto: TextField con maxLength y contador; envía el texto recortado', async () => {
    const validar = montar({ ...base, clave: 'placa', etiqueta: 'Placa', ayuda: 'Como aparece', tipo: 'texto', max: 8 })
    const input = screen.getByRole('textbox', { name: 'Placa' })
    expect(input).toHaveAttribute('maxLength', '8')
    fireEvent.change(input, { target: { value: ' P123 ' } })

    expect(screen.getByText('Como aparece · 4/8')).toBeInTheDocument()
    expect(await validar()).toEqual({ valido: true, enviado: { placa: 'P123' } })
  })

  it('texto: aplica el patrón', async () => {
    const validar = montar({ ...base, clave: 'placa', etiqueta: 'Placa', tipo: 'texto', max: 8, patron: '^P[0-9]+$' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Placa' }), { target: { value: 'X123' } })

    expect((await validar()).valido).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent(camposExtra.errores.PATRON)
  })

  it('número: inputMode numeric si es entero y se envía como number', async () => {
    const validar = montar({ ...base, clave: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', entero: true })
    const input = screen.getByRole('textbox', { name: 'Cantidad' })
    expect(input).toHaveAttribute('inputMode', 'numeric')
    fireEvent.change(input, { target: { value: '12' } })

    const { enviado } = await validar()
    expect(enviado).toEqual({ cantidad: 12 })
    expect(typeof enviado?.cantidad).toBe('number')
  })

  it('número: inputMode decimal si no es entero', () => {
    montar({ ...base, clave: 'metros', etiqueta: 'Metros', tipo: 'numero', entero: false })
    expect(screen.getByRole('textbox', { name: 'Metros' })).toHaveAttribute('inputMode', 'decimal')
  })

  it('fecha: input date con max en hoy si es noFutura, y rechaza una fecha futura', async () => {
    const validar = montar({ ...base, clave: 'desde', etiqueta: 'Desde cuándo', tipo: 'fecha', noFutura: true })
    const input = screen.getByLabelText('Desde cuándo')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('max', HOY)
    fireEvent.change(input, { target: { value: '2026-10-24' } })

    expect((await validar()).valido).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent(camposExtra.errores.FECHA_FUTURA)
  })

  it('selección con hasta 5 opciones: radios; envía el valor', async () => {
    const validar = montar({
      ...base,
      clave: 'material',
      etiqueta: 'Material',
      tipo: 'seleccion',
      opciones: [
        { valor: 'madera', etiqueta: 'Madera' },
        { valor: 'concreto', etiqueta: 'Concreto' },
      ],
    })
    const grupo = screen.getByRole('radiogroup', { name: 'Material' })
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Concreto' }))

    expect((await validar()).enviado).toEqual({ material: 'concreto' })
  })

  it('selección con más de 5 opciones: lista desplegable', () => {
    const opciones = ['a', 'b', 'c', 'd', 'e', 'f'].map((valor) => ({ valor, etiqueta: valor.toUpperCase() }))
    montar({ ...base, clave: 'sector', etiqueta: 'Sector', tipo: 'seleccion', opciones })

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sector' })).toBeInTheDocument()
  })

  it('sí/no: radios Sí y No; envía un boolean', async () => {
    const validar = montar({ ...base, clave: 'heridos', etiqueta: '¿Hay heridos?', tipo: 'si_no' })
    const grupo = screen.getByRole('radiogroup', { name: '¿Hay heridos?' })
    fireEvent.click(within(grupo).getByRole('radio', { name: camposExtra.no }))

    const { enviado } = await validar()
    expect(enviado).toEqual({ heridos: false })
    expect(typeof enviado?.heridos).toBe('boolean')
  })

  it('un campo requerido vacío no es válido', async () => {
    const validar = montar({ ...base, requerido: true, clave: 'heridos', etiqueta: '¿Hay heridos?', tipo: 'si_no' })

    expect((await validar()).valido).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent(camposExtra.errores.REQUERIDO)
  })
})
