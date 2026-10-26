import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AdminPage } from '../../../src/features/admin/pages/AdminPage'
import admin from '../../../src/locales/es/admin.json'
import '../../../src/shared/i18n/i18n'

describe('AdminPage', () => {
  it('es un índice con la tarjeta "Políticas de SLA", su descripción y el enlace a /admin/sla', () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(admin.titulo)
    const tarjeta = screen.getByRole('region', { name: admin.indice.sla.titulo })
    expect(within(tarjeta).getByText(admin.indice.sla.descripcion)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: admin.indice.sla.titulo })).toHaveAttribute('href', '/admin/sla')
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument()
  })

  it.each([
    ['dependencias', '/admin/dependencias'],
    ['categorias', '/admin/categorias'],
    ['zonas', '/admin/zonas'],
  ] as const)('tiene la tarjeta de %s con su descripción y su enlace (SPEC 40)', (clave, ruta) => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    const tarjeta = screen.getByRole('region', { name: admin.indice[clave].titulo })
    expect(within(tarjeta).getByText(admin.indice[clave].descripcion)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: admin.indice[clave].titulo })).toHaveAttribute('href', ruta)
  })
})
