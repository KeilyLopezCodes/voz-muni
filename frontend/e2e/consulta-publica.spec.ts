import { expect, test } from '@playwright/test'
import { sinScrollHorizontal } from './api-simulada'

const NUMERO = 'Q-2026-000123'

// Una respuesta larga a propósito: textos sin espacios, varios eventos y comentarios.
const CONSULTA = {
  numero: NUMERO,
  titulo: 'Bache enorme frente a la escuela de la colonia El Mirador que ya dañó varios carros',
  estado: 'resuelta',
  categoria: 'Baches',
  zona: 'Zona 1',
  creadoEn: '2026-10-20T15:00:00.000Z',
  resueltoEn: '2026-10-24T15:00:00.000Z',
  cerradoEn: null,
  cierreAutomatico: false,
  esperaRespuesta: false,
  solucion: {
    descripcion: 'Se rellenó el bache con asfalto.\nReferencia: https://vozmuni.test/obras/bacheo/orden-de-trabajo-0000123456789',
    resueltaEn: '2026-10-24T15:00:00.000Z',
  },
  confirmacion: { venceEn: '2026-10-31T05:59:59.999Z', vencida: false },
  lineaTiempo: [
    { ocurridoEn: '2026-10-24T15:00:00.000Z', actor: 'municipalidad', estadoAnterior: 'en_proceso', estadoNuevo: 'resuelta', motivo: 'Se rellenó el bache con asfalto.' },
    { ocurridoEn: '2026-10-22T15:00:00.000Z', actor: 'municipalidad', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null },
    { ocurridoEn: '2026-10-20T15:00:00.000Z', actor: 'vecino', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null },
  ],
  comentarios: [
    { cuerpo: 'Vamos el jueves por la mañana', autor: 'municipalidad', creadoEn: '2026-10-22T16:00:00.000Z', editadoEn: null },
    { cuerpo: 'Gracias, aquí estaremos', autor: 'vecino', creadoEn: '2026-10-22T17:00:00.000Z', editadoEn: '2026-10-22T17:02:00.000Z' },
  ],
}

// La consulta pública a 360×740 (SPEC 37), sin sesión, con la API simulada.
test('consulta una queja con el enlace del correo, sin scroll horizontal', async ({ page }) => {
  let contactoEnviado: string | null = null
  await page.route('**/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"estado":"ok"}' }))
  await page.route(`**/api/v1/public/tickets/${NUMERO}?*`, (route) => {
    contactoEnviado = new URL(route.request().url()).searchParams.get('contacto')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONSULTA) })
  })

  await page.goto(`/consulta?numero=${NUMERO}`)
  await expect(page.getByRole('textbox', { name: /Número de queja/ })).toHaveValue(NUMERO)
  await sinScrollHorizontal(page)

  await page.getByRole('textbox', { name: /Correo o teléfono/ }).fill('ana@correo.gt')
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText(CONSULTA.titulo)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inicia sesión para confirmar o reabrir' })).toBeVisible()
  expect(contactoEnviado).toBe('ana@correo.gt')
  expect(page.url()).not.toContain('ana@correo.gt')
  await sinScrollHorizontal(page)
})
