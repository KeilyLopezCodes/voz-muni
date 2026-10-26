import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoriaSla } from '../../../src/features/admin/api/politicas-sla-api'
import { PoliticasSlaPage } from '../../../src/features/admin/sla/PoliticasSlaPage'
import admin from '../../../src/locales/es/admin.json'
import '../../../src/shared/i18n/i18n'
import { type Manejador, renderConConsultas, respuesta, simularApi } from '../tickets/api-simulada'

const { dialogo } = admin.sla

afterEach(() => {
  vi.unstubAllGlobals()
})

const BACHES: CategoriaSla = {
  categoria: { id: 2, nombre: 'Baches', activa: true },
  dependencia: { id: 1, nombre: 'Dirección de Obras' },
  plazos: [
    { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
    { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
    { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
    { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
  ],
  completa: true,
  actualizadoEn: null,
  actualizadoPor: null,
}

const ACERAS: CategoriaSla = { ...BACHES, categoria: { id: 1, nombre: 'Aceras', activa: true }, plazos: [], completa: false }

// Se monta la página para probar también la invalidación de la lista y el aviso.
async function abrir(categoria: CategoriaSla, guardar: Manejador = () => respuesta(200, categoria)) {
  const fetchMock = simularApi({
    'GET /admin/politicas-sla': () => respuesta(200, { datos: [categoria] }),
    [`PUT /admin/categorias/${categoria.categoria.id}/politicas-sla`]: guardar,
  })
  renderConConsultas(<PoliticasSlaPage />)
  fireEvent.click(await screen.findByRole('button', { name: `Editar el SLA de ${categoria.categoria.nombre}` }))
  return { fetchMock, dialogo: screen.getByRole('dialog') }
}

const grupo = (nombre: string) => screen.getByRole('group', { name: nombre })
const campo = (prioridad: string, etiqueta: string) => within(grupo(prioridad)).getByRole('spinbutton', { name: etiqueta })
const escribir = (prioridad: string, etiqueta: string, valor: string) =>
  fireEvent.change(campo(prioridad, etiqueta), { target: { value: valor } })
const guardar = () => fireEvent.click(screen.getByRole('button', { name: dialogo.guardar }))
const llamadasPut = (fetchMock: ReturnType<typeof simularApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')

describe('DialogoMatrizSla', () => {
  it('se precarga con los valores existentes y avisa que las quejas abiertas conservan sus plazos', async () => {
    await abrir(BACHES)
    expect(campo('Urgente', dialogo.respuesta)).toHaveValue(2)
    expect(campo('Urgente', dialogo.resolucion)).toHaveValue(24)
    expect(campo('Baja', dialogo.resolucion)).toHaveValue(120)
    expect(screen.getByText(dialogo.aviso)).toBeInTheDocument()
  })

  it('una categoría sin SLA empieza vacía, y guardar con campos vacíos se bloquea', async () => {
    const { fetchMock } = await abrir(ACERAS)
    expect(campo('Media', dialogo.respuesta)).toHaveValue(null)
    guardar()
    expect(await within(grupo('Media')).findAllByText(dialogo.errores.REQUERIDO)).toHaveLength(2)
    expect(llamadasPut(fetchMock)).toHaveLength(0)
  })

  it('bloquea respuesta mayor que resolución con el mensaje en el campo', async () => {
    const { fetchMock } = await abrir(BACHES)
    escribir('Media', dialogo.respuesta, '80')
    guardar()
    expect(await within(grupo('Media')).findByText(dialogo.errores.RESPUESTA_MAYOR_QUE_RESOLUCION)).toBeInTheDocument()
    expect(campo('Media', dialogo.respuesta)).toHaveAttribute('aria-invalid', 'true')
    expect(llamadasPut(fetchMock)).toHaveLength(0)
  })

  it('bloquea una matriz no monótona y marca la prioridad que rompe el orden', async () => {
    const { fetchMock } = await abrir(BACHES)
    escribir('Alta', dialogo.resolucion, '100')
    guardar()
    expect(await within(grupo('Media')).findByText(dialogo.errores.NO_MONOTONA)).toBeInTheDocument()
    expect(campo('Media', dialogo.resolucion)).toHaveAttribute('aria-invalid', 'true')
    expect(llamadasPut(fetchMock)).toHaveLength(0)
  })

  it('bloquea decimales', async () => {
    await abrir(BACHES)
    escribir('Urgente', dialogo.respuesta, '1.5')
    guardar()
    expect(await within(grupo('Urgente')).findByText(dialogo.errores.HORAS_INVALIDAS)).toBeInTheDocument()
  })

  it('un 400 MATRIZ_SLA_INVALIDA del servidor se muestra en el campo de cada detalle', async () => {
    await abrir(BACHES, () =>
      respuesta(400, {
        codigo: 'MATRIZ_SLA_INVALIDA',
        mensaje: 'x',
        detalles: [
          { prioridad: 'alta', campo: 'horasRespuesta', problema: 'HORAS_INVALIDAS' },
          { prioridad: 'baja', campo: 'horasResolucion', problema: 'NO_MONOTONA' },
        ],
      }),
    )
    guardar()
    expect(await within(grupo('Alta')).findByText(dialogo.errores.HORAS_INVALIDAS)).toBeInTheDocument()
    expect(within(grupo('Baja')).getByText(dialogo.errores.NO_MONOTONA)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('al guardar envía la matriz de baja a urgente, invalida la lista, cierra y avisa', async () => {
    let cuerpo: unknown = null
    const { fetchMock } = await abrir(BACHES, (_url, init) => {
      cuerpo = JSON.parse(String(init?.body))
      return respuesta(200, BACHES)
    })
    escribir('Media', dialogo.resolucion, '96')
    guardar()
    expect(await screen.findByText('Guardamos el SLA de Baches')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cuerpo).toEqual({
      plazos: [
        { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
        { prioridad: 'media', horasRespuesta: 24, horasResolucion: 96 },
        { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
        { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
      ],
    })
    // La lista se vuelve a pedir: una lectura al abrir y otra después de guardar.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([entrada, init]) => (init?.method ?? 'GET') === 'GET' && String(entrada).includes('politicas-sla')),
      ).toHaveLength(2),
    )
  })

  it('un error de red muestra el error general sin cerrar', async () => {
    await abrir(BACHES, () => respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }))
    guardar()
    expect(await screen.findByText(dialogo.errorGuardar)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
