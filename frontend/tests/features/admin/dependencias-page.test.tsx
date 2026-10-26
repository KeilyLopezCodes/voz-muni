import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DependenciasPage } from '../../../src/features/admin/catalogos/DependenciasPage'
import admin from '../../../src/locales/es/admin.json'
import '../../../src/shared/i18n/i18n'
import { respuesta, simularApi } from '../tickets/api-simulada'
import { DEPENDENCIAS, montarEn } from './catalogos-simulados'

const { catalogos: textos } = admin

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(rutas = {}) {
  const fetchMock = simularApi({ 'GET /admin/dependencias': () => respuesta(200, { datos: DEPENDENCIAS }), ...rutas })
  const router = montarEn('/admin/dependencias', <DependenciasPage />)
  return { fetchMock, router }
}

const cuerpoDe = (fetchMock: ReturnType<typeof simularApi>, metodo: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === metodo)![1]!.body))

describe('DependenciasPage', () => {
  it('lista las activas con sus contadores y "Mostrar inactivas" agrega las inactivas', async () => {
    montar()

    expect(await screen.findByText('Dirección de Obras')).toBeInTheDocument()
    const fila = screen.getByText('Dirección de Obras').closest('tr')!
    expect(within(fila).getByText('5')).toBeInTheDocument()
    expect(within(fila).getByText(textos.activa)).toBeInTheDocument()
    expect(screen.queryByText('Dependencia cerrada')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: textos.mostrarInactivas }))
    expect(screen.getByText('Dependencia cerrada').closest('tr')).toHaveTextContent(textos.inactiva)
  })

  it('crea una dependencia y muestra NOMBRE_DUPLICADO en el campo del nombre', async () => {
    let intentos = 0
    const { fetchMock } = montar({
      'POST /admin/dependencias': () =>
        ++intentos === 1
          ? respuesta(409, { codigo: 'NOMBRE_DUPLICADO', mensaje: 'x' })
          : respuesta(201, { ...DEPENDENCIAS[1], id: 9, nombre: 'Parques' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: textos.dependencias.nueva }))
    fireEvent.change(screen.getByRole('textbox', { name: textos.nombre }), { target: { value: 'Agua potable' } })
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))

    expect(await screen.findByText(textos.errores.NOMBRE_DUPLICADO)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: textos.nombre })).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(screen.getByRole('textbox', { name: textos.nombre }), { target: { value: 'Parques' } })
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))
    expect(await screen.findByText(textos.guardado)).toBeInTheDocument()
    expect(cuerpoDe(fetchMock, 'POST')).toEqual({ nombre: 'Agua potable' })
  })

  it('renombra con PATCH solo el nombre', async () => {
    const { fetchMock } = montar({ 'PATCH /admin/dependencias/2': () => respuesta(200, { ...DEPENDENCIAS[1], nombre: 'Aguas' }) })
    fireEvent.click(await screen.findByRole('button', { name: `${textos.editar} Agua Potable` }))
    fireEvent.change(screen.getByRole('textbox', { name: textos.nombre }), { target: { value: 'Aguas' } })
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))

    await screen.findByText(textos.guardado)
    expect(cuerpoDe(fetchMock, 'PATCH')).toEqual({ nombre: 'Aguas' })
  })

  it('desactivar pide confirmación y un 409 DEPENDENCIA_EN_USO lista las categorías con su enlace', async () => {
    montar({
      'PATCH /admin/dependencias/1': () =>
        respuesta(409, {
          codigo: 'DEPENDENCIA_EN_USO',
          mensaje: 'x',
          detalles: [
            { id: 10, nombre: 'Baches' },
            { id: 12, nombre: 'Banquetas' },
          ],
        }),
    })
    fireEvent.click(await screen.findByRole('button', { name: `${textos.desactivar} Dirección de Obras` }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Dirección de Obras dejará de estar disponible para quejas nuevas')
    fireEvent.click(within(dialogo).getByRole('button', { name: textos.desactivar }))

    expect(await within(dialogo).findByText(textos.errores.DEPENDENCIA_EN_USO)).toBeInTheDocument()
    expect(within(dialogo).getByRole('link', { name: 'Editar Baches' })).toHaveAttribute('href', '/admin/categorias?editar=10')
    expect(within(dialogo).getByRole('link', { name: 'Editar Banquetas' })).toHaveAttribute('href', '/admin/categorias?editar=12')
  })

  it('una desactivación correcta cierra la confirmación y avisa', async () => {
    const { fetchMock } = montar({ 'PATCH /admin/dependencias/2': () => respuesta(200, { ...DEPENDENCIAS[1], activa: false }) })
    fireEvent.click(await screen.findByRole('button', { name: `${textos.desactivar} Agua Potable` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: textos.desactivar }))

    expect(await screen.findByText(textos.guardado)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cuerpoDe(fetchMock, 'PATCH')).toEqual({ activa: false })
  })
})
