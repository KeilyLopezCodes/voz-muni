import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoriasPage } from '../../../src/features/admin/catalogos/CategoriasPage'
import admin from '../../../src/locales/es/admin.json'
import '../../../src/shared/i18n/i18n'
import { respuesta, simularApi } from '../tickets/api-simulada'
import { CATEGORIAS, DEPENDENCIAS, montarEn } from './catalogos-simulados'

const { catalogos: textos } = admin

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(rutas = {}, ruta = '/admin/categorias') {
  const fetchMock = simularApi({
    'GET /admin/categorias': () => respuesta(200, { datos: CATEGORIAS }),
    'GET /admin/dependencias': () => respuesta(200, { datos: DEPENDENCIAS }),
    ...rutas,
  })
  const router = montarEn(ruta, <CategoriasPage />)
  return { fetchMock, router }
}

describe('CategoriasPage', () => {
  it('muestra la dependencia, "Sin SLA" con su enlace a /admin/sla y los campos adicionales', async () => {
    montar()
    fireEvent.click(await screen.findByRole('switch', { name: textos.mostrarInactivas }))

    const arboles = (await screen.findByText('Árboles caídos')).closest('tr')!
    expect(within(arboles).getByRole('link', { name: textos.categorias.sinSla })).toHaveAttribute('href', '/admin/sla')
    expect(within(arboles).getByText('0 campos adicionales')).toBeInTheDocument()
    const baches = screen.getByText('Baches').closest('tr')!
    expect(within(baches).getByText(textos.categorias.slaCompleto)).toBeInTheDocument()
    expect(within(baches).getByText('2 campos adicionales')).toBeInTheDocument()
  })

  it('el selector de dependencia solo ofrece las activas, y avisa que la categoría nace inactiva', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: textos.categorias.nueva }))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.categorias.dependencia }))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Dirección de Obras', 'Agua Potable'])
    expect(screen.getByText(textos.categorias.nuevaInactiva)).toBeInTheDocument()
  })

  it('activar sin SLA muestra el error con el enlace a /admin/sla', async () => {
    montar({ 'PATCH /admin/categorias/11': () => respuesta(409, { codigo: 'SLA_INCOMPLETO', mensaje: 'x' }) })
    fireEvent.click(await screen.findByRole('switch', { name: textos.mostrarInactivas }))
    fireEvent.click(await screen.findByRole('button', { name: `${textos.activar} Árboles caídos` }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(textos.errores.SLA_INCOMPLETO)
    expect(within(alerta).getByRole('link', { name: textos.irSla })).toHaveAttribute('href', '/admin/sla')
  })

  it('al cambiar la dependencia aparece el aviso, y el PATCH solo manda lo que cambió', async () => {
    const { fetchMock } = montar({ 'PATCH /admin/categorias/10': () => respuesta(200, CATEGORIAS[0]) })
    fireEvent.click(await screen.findByRole('button', { name: `${textos.editar} Baches` }))
    expect(screen.queryByText(/Las quejas ya aceptadas/)).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.categorias.dependencia }))
    fireEvent.click(await screen.findByRole('option', { name: 'Agua Potable' }))

    expect(screen.getByText('Las quejas ya aceptadas siguen en su dependencia actual. Solo las nuevas irán a Agua Potable.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))
    await screen.findByText(textos.guardado)
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ nombre: 'Baches', dependenciaId: 2 })
  })

  it('NOMBRE_DUPLICADO se muestra en el campo del nombre', async () => {
    montar({ 'POST /admin/categorias': () => respuesta(409, { codigo: 'NOMBRE_DUPLICADO', mensaje: 'x' }) })
    fireEvent.click(await screen.findByRole('button', { name: textos.categorias.nueva }))
    fireEvent.change(screen.getByRole('textbox', { name: textos.nombre }), { target: { value: 'baches' } })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.categorias.dependencia }))
    fireEvent.click(await screen.findByRole('option', { name: 'Dirección de Obras' }))
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))

    expect(await screen.findByText(textos.errores.NOMBRE_DUPLICADO)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: textos.nombre })).toHaveAttribute('aria-invalid', 'true')
  })

  it('?editar=<id> abre la edición de esa categoría', async () => {
    const { router } = montar({}, '/admin/categorias?editar=10')
    expect(await screen.findByRole('dialog')).toHaveTextContent(textos.categorias.editarTitulo)
    expect(screen.getByRole('textbox', { name: textos.nombre })).toHaveValue('Baches')
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })
})
