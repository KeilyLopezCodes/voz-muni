import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZonasPage } from '../../../src/features/admin/catalogos/ZonasPage'
import admin from '../../../src/locales/es/admin.json'
import comun from '../../../src/locales/es/comun.json'
import '../../../src/shared/i18n/i18n'
import { respuesta, simularApi } from '../tickets/api-simulada'
import { montarEn, ZONAS } from './catalogos-simulados'

const { catalogos: textos } = admin

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ZonasPage', () => {
  it('muestra el tipo traducido, y el diálogo ofrece los 3 tipos fijos', async () => {
    const fetchMock = simularApi({
      'GET /admin/zonas': () => respuesta(200, { datos: ZONAS }),
      'POST /admin/zonas': () => respuesta(201, { id: 30, nombre: 'Aldea Nueva', tipo: 'aldea', activa: true }),
    })
    montarEn('/admin/zonas', <ZonasPage />)

    expect(within((await screen.findByText('El Mirador')).closest('tr')!).getByText(comun.tiposZona.colonia)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: textos.zonas.nueva }))
    fireEvent.change(screen.getByRole('textbox', { name: textos.nombre }), { target: { value: 'Aldea Nueva' } })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: textos.zonas.tipo }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      comun.tiposZona.zona,
      comun.tiposZona.colonia,
      comun.tiposZona.aldea,
    ])
    fireEvent.click(screen.getByRole('option', { name: comun.tiposZona.aldea }))
    fireEvent.click(screen.getByRole('button', { name: textos.guardar }))

    expect(await screen.findByText(textos.guardado)).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toEqual({ nombre: 'Aldea Nueva', tipo: 'aldea' })
  })

  it('desactivar pide confirmación y manda activa: false', async () => {
    const fetchMock = simularApi({
      'GET /admin/zonas': () => respuesta(200, { datos: ZONAS }),
      'PATCH /admin/zonas/20': () => respuesta(200, { ...ZONAS[0], activa: false }),
    })
    montarEn('/admin/zonas', <ZonasPage />)

    fireEvent.click(await screen.findByRole('button', { name: `${textos.desactivar} Zona 1` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: textos.desactivar }))

    expect(await screen.findByText(textos.guardado)).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ activa: false })
  })
})
