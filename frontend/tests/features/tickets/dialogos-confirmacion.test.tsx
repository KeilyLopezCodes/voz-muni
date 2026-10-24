import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialogoConfirmar } from '../../../src/features/tickets/mis-quejas/DialogoConfirmar'
import { DialogoReabrir } from '../../../src/features/tickets/mis-quejas/DialogoReabrir'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'

const { confirmacion: conf } = tickets.detalle

describe('DialogoConfirmar', () => {
  it('sin motivo exigido (el vecino) no pide texto y confirma con undefined', () => {
    const onConfirmar = vi.fn()
    render(<DialogoConfirmar open exigeMotivo={false} enviando={false} onCancelar={vi.fn()} onConfirmar={onConfirmar} />)

    expect(screen.getByRole('dialog', { name: conf.dialogoConfirmar.titulo })).toHaveTextContent(conf.dialogoConfirmar.texto)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: conf.dialogoConfirmar.aceptar }))

    expect(onConfirmar).toHaveBeenCalledWith(undefined)
  })

  it('con motivo exigido (un interno) el campo es obligatorio y no acepta solo espacios', () => {
    const onConfirmar = vi.fn()
    render(<DialogoConfirmar open exigeMotivo enviando={false} onCancelar={vi.fn()} onConfirmar={onConfirmar} />)

    const campo = screen.getByRole('textbox')
    const aceptar = screen.getByRole('button', { name: conf.dialogoConfirmar.aceptar })
    expect(campo).toBeRequired()
    expect(aceptar).toBeDisabled()
    fireEvent.change(campo, { target: { value: '   ' } })
    expect(aceptar).toBeDisabled()
    fireEvent.change(campo, { target: { value: 'Confirmó en ventanilla' } })
    fireEvent.click(aceptar)

    expect(onConfirmar).toHaveBeenCalledWith('Confirmó en ventanilla')
  })

  it('un motivo de más de 1000 caracteres no se puede enviar', () => {
    render(<DialogoConfirmar open exigeMotivo enviando={false} onCancelar={vi.fn()} onConfirmar={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(1001) } })

    expect(screen.getByRole('button', { name: conf.dialogoConfirmar.aceptar })).toBeDisabled()
    expect(screen.getByText('1001 / 1000')).toBeInTheDocument()
  })

  it('"Cancelar" no envía nada', () => {
    const onCancelar = vi.fn()
    const onConfirmar = vi.fn()
    render(<DialogoConfirmar open exigeMotivo={false} enviando={false} onCancelar={onCancelar} onConfirmar={onConfirmar} />)

    fireEvent.click(screen.getByRole('button', { name: conf.cancelar }))

    expect(onCancelar).toHaveBeenCalled()
    expect(onConfirmar).not.toHaveBeenCalled()
  })
})

describe('DialogoReabrir', () => {
  it.each([
    [1, 'Puedes reabrirla 1 vez más.'],
    [2, 'Puedes reabrirla 2 veces más.'],
  ])('con %i reapertura(s) restante(s) dice "%s"', (restantes, texto) => {
    render(<DialogoReabrir open reaperturasRestantes={restantes} enviando={false} onCancelar={vi.fn()} onReabrir={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: conf.dialogoReabrir.titulo })).toHaveTextContent(texto)
  })

  it('exige motivo y lo envía tal cual', () => {
    const onReabrir = vi.fn()
    render(<DialogoReabrir open reaperturasRestantes={2} enviando={false} onCancelar={vi.fn()} onReabrir={onReabrir} />)

    const aceptar = screen.getByRole('button', { name: conf.dialogoReabrir.aceptar })
    expect(screen.getByRole('textbox')).toBeRequired()
    expect(aceptar).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sigue el bache' } })
    fireEvent.click(aceptar)

    expect(onReabrir).toHaveBeenCalledWith('Sigue el bache')
  })

  it('mientras envía, el botón queda deshabilitado con "Enviando…"', () => {
    render(<DialogoReabrir open reaperturasRestantes={2} enviando onCancelar={vi.fn()} onReabrir={vi.fn()} />)

    expect(screen.getByRole('button', { name: conf.enviando })).toBeDisabled()
  })
})
