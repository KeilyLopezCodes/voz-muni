import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

const json = (route: Route, cuerpo: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) })

const SLA = {
  venceRespuesta: null,
  primeraRespuestaEn: null,
  venceResolucion: '2099-10-31T22:00:00.000Z',
  pausado: false,
  restanteMinutosEnPausa: null,
  escalado: false,
  escaladoEn: null,
  escaladoPor: null,
}

const queja = (id: number, cambios: Record<string, unknown> = {}) => ({
  id,
  numero: `Q-2026-00000${id}`,
  titulo: 'Bache enorme frente a la escuela de la colonia El Mirador que ya dañó varios carros',
  estado: 'en_proceso',
  creadoEn: '2026-10-20T15:00:00.000Z',
  esperaRespuesta: false,
  confirmacionVenceEn: null,
  pendienteCalificar: false,
  interno: {
    prioridad: 'urgente',
    categoria: { id: 2, nombre: 'Baches' },
    dependencia: { id: 10, nombre: 'Dirección de Obras' },
    tecnico: { id: 30, nombre: 'Técnico de desarrollo con un nombre bastante largo' },
    sla: SLA,
  },
  ...cambios,
})

const DATOS = [
  queja(1),
  queja(2, {
    estado: 'nueva',
    interno: { prioridad: null, categoria: { id: 2, nombre: 'Baches' }, dependencia: null, tecnico: null, sla: { ...SLA, venceResolucion: null } },
  }),
  queja(3, { interno: { ...queja(3).interno, sla: { ...SLA, escalado: true, escaladoEn: '2026-10-21T15:00:00.000Z', escaladoPor: 'respuesta' } } }),
]

const RESUMEN = {
  porEstado: { nueva: 1, en_revision: 0, asignada: 0, en_proceso: 2, en_espera: 0, resuelta: 0, cerrada: 0, rechazada: 0 },
  total: 3,
}

async function simularListado(page: Parameters<typeof simular>[0]) {
  await simular(page, 'supervisor', {
    'GET /tickets': (route, url) => {
      const datos = url.searchParams.get('escalado') === 'true' ? DATOS.filter((t) => t.interno.sla.escalado) : DATOS
      return json(route, { datos, pagina: 1, tamano: 20, total: datos.length })
    },
    'GET /tickets/resumen': (route) => json(route, RESUMEN),
    'GET /dependencias': (route) => json(route, [{ id: 10, nombre: 'Dirección de Obras' }]),
  })
}

// Listado interno a 360×740 (SPEC 45, RNF-14): tarjetas, los filtros plegados y nada de scroll horizontal.
test('a 360 px el supervisor ve tarjetas y los filtros plegados, sin scroll horizontal', async ({ page }) => {
  await simularListado(page)

  await page.goto('/tickets')
  await expect(page.getByRole('heading', { level: 1, name: 'Quejas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir la queja Q-2026-000001' })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByText('Sin dependencia')).toBeVisible()
  await sinScrollHorizontal(page)

  const filtros = page.getByRole('button', { name: 'Filtros', exact: true })
  await expect(filtros).toHaveAttribute('aria-expanded', 'false')
  await filtros.click()
  await expect(filtros).toHaveAttribute('aria-expanded', 'true')
  const soloEscaladas = page.getByRole('switch', { name: 'Solo escaladas' })
  await soloEscaladas.scrollIntoViewIfNeeded()
  await page.getByText('Solo escaladas').click()
  await expect(soloEscaladas).toBeChecked()
  await expect(page).toHaveURL(/\?escalado=true$/)
  await expect(page.getByRole('link', { name: 'Abrir la queja Q-2026-000001' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Abrir la queja Q-2026-000003' })).toBeVisible()
  await sinScrollHorizontal(page)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Filtros (1 activo)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir la queja Q-2026-000003' })).toBeVisible()
})

test('a 1280 px se ve la tabla y el número abre el detalle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await simularListado(page)

  await page.goto('/tickets')
  const tabla = page.getByRole('table', { name: 'Quejas que coinciden con los filtros' })
  await expect(tabla).toBeVisible()
  await expect(tabla.getByRole('row')).toHaveCount(4) // encabezado + 3 quejas
  await expect(tabla.getByText('Escalada')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Solo escaladas' })).toBeVisible() // sin plegar en escritorio

  await tabla.getByRole('link', { name: 'Abrir la queja Q-2026-000002' }).click()
  await expect(page).toHaveURL(/\/tickets\/2$/)
})
