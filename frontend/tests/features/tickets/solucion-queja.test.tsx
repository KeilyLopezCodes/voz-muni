import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ResolucionDetalle } from '../../../src/features/tickets/api/tickets-api'
import { SolucionQueja } from '../../../src/features/tickets/mis-quejas/SolucionQueja'
import tickets from '../../../src/locales/es/tickets.json'
import '../../../src/shared/i18n/i18n'

const { solucion: textos } = tickets.detalle

function resolucion(cambios: Partial<ResolucionDetalle> = {}): ResolucionDetalle {
  return {
    descripcion: 'Se rellenó el bache con asfalto.\nSe señalizó la zona.',
    // 00:30 UTC del 24 es todavía el 23 en Guatemala (UTC-6).
    resueltaEn: '2026-10-24T00:30:00.000Z',
    resueltaPor: { id: 3, nombre: 'Técnico de desarrollo' },
    ...cambios,
  }
}

describe('SolucionQueja', () => {
  it('es una sección con el título "Solución" y muestra la descripción con sus saltos de línea', () => {
    render(<SolucionQueja resolucion={resolucion()} pendienteDeConfirmar={false} />)

    const seccion = screen.getByRole('region', { name: textos.titulo })
    const descripcion = screen.getByText(/Se rellenó el bache con asfalto\./)
    expect(seccion).toContainElement(descripcion)
    expect(descripcion.textContent).toBe('Se rellenó el bache con asfalto.\nSe señalizó la zona.')
    expect(descripcion).toHaveStyle({ whiteSpace: 'pre-wrap' })
  })

  it('muestra la fecha en America/Guatemala y "por <nombre>" si hay resueltaPor', () => {
    render(<SolucionQueja resolucion={resolucion()} pendienteDeConfirmar={false} />)

    const fecha = screen.getByText(/^Resuelta el /)
    expect(fecha).toHaveTextContent('23 oct 2026')
    expect(fecha).toHaveAttribute('dateTime', '2026-10-24T00:30:00.000Z')
    expect(screen.getByText(/por Técnico de desarrollo/)).toBeInTheDocument()
  })

  it('sin resueltaPor no muestra "por"', () => {
    render(<SolucionQueja resolucion={resolucion({ resueltaPor: null })} pendienteDeConfirmar={false} />)

    expect(screen.getByRole('region', { name: textos.titulo })).not.toHaveTextContent(/\bpor\b/)
  })

  it('muestra el aviso sobre confirmar o reabrir solo si está pendiente de confirmar', () => {
    const { rerender } = render(<SolucionQueja resolucion={resolucion()} pendienteDeConfirmar={false} />)
    expect(screen.queryByText(textos.pendienteConfirmar)).not.toBeInTheDocument()

    rerender(<SolucionQueja resolucion={resolucion()} pendienteDeConfirmar />)
    expect(screen.getByText(textos.pendienteConfirmar)).toBeInTheDocument()
  })

  it('una descripción con <b> se muestra como texto, sin interpretarse', () => {
    const { container } = render(
      <SolucionQueja resolucion={resolucion({ descripcion: '<b>Listo</b> <img src=x onerror=alert(1)>' })} pendienteDeConfirmar={false} />,
    )

    expect(screen.getByText('<b>Listo</b> <img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})
