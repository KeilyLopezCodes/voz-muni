import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

// El tablero (SPEC 43) a 360×740: tarjetas y gráficas apiladas, sin scroll horizontal de página; las tablas de
// indicadores se desplazan dentro de su contenedor.

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

const indicadores = {
  cantidad: 42,
  horasPromedioRespuesta: 6.5,
  horasPromedioResolucion: 31.2,
  cumplimientoRespuesta: { cumple: 30, incumple: 8, pendiente: 4, porcentaje: 78.9 },
  cumplimientoResolucion: { cumple: 20, incumple: 10, pendiente: 12, porcentaje: 66.7 },
  escaladasAbiertas: 3,
}
const LARGA = 'Dirección de Obras Públicas y Mantenimiento Urbano Municipal'

const RESUMEN = {
  rango: { desde: '2026-09-27', hasta: '2026-10-26' },
  total: 42,
  porEstado: ['nueva', 'en_revision', 'rechazada', 'asignada', 'en_proceso', 'en_espera', 'resuelta', 'cerrada'].map((estado, i) => ({
    estado,
    cantidad: i + 2,
  })),
  porCategoria: [
    { id: 1, nombre: 'Baches y hundimientos en calles pavimentadas', cantidad: 30 },
    { id: 2, nombre: 'Alumbrado', cantidad: 12 },
  ],
  porDependencia: [
    { id: 1, nombre: LARGA, cantidad: 30 },
    { id: null, nombre: null, cantidad: 12 },
  ],
  porZona: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, nombre: `Colonia número ${i + 1}`, tipo: 'colonia', cantidad: 13 - i })),
  indicadores,
  indicadoresPorDependencia: [{ id: 1, nombre: LARGA, ...indicadores }],
  indicadoresPorCategoria: [
    { id: 1, nombre: 'Baches y hundimientos en calles pavimentadas', ...indicadores },
    { id: 2, nombre: 'Alumbrado', ...indicadores, horasPromedioRespuesta: null },
  ],
  generadoEn: new Date().toISOString(),
}

test('el tablero sin scroll horizontal de página, con las tablas desplazables dentro de su contenedor', async ({ page }) => {
  await simular(page, 'supervisor', {
    'GET /reportes/resumen': (route) => json(route, 200, RESUMEN),
    'GET /notificaciones': (route) => json(route, 200, { datos: [], noLeidas: 0 }),
  })

  await page.goto('/reportes')
  await expect(page.getByRole('article', { name: 'Quejas registradas' })).toBeVisible()
  // Las gráficas se cargan aparte (Recharts en su propio chunk).
  await expect(page.locator('.recharts-wrapper').first()).toBeVisible()
  await sinScrollHorizontal(page)

  const contenedor = page.getByTestId('contenedor-tabla').first()
  await contenedor.scrollIntoViewIfNeeded()
  const { scrollWidth, clientWidth } = await contenedor.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)
  await sinScrollHorizontal(page)

  const zonas = page.getByRole('region', { name: 'Quejas por zona' })
  await zonas.getByRole('button', { name: 'Ver como tabla' }).click()
  await expect(zonas.getByRole('rowheader', { name: 'Otras' })).toBeVisible()
  await sinScrollHorizontal(page)
})
