import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

const json = (route: Route, cuerpo: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) })

const queja = (id: number, estado: string, cambios: Record<string, unknown> = {}) => ({
  id,
  numero: `Q-2026-00000${id}`,
  titulo: 'Bache enorme frente a la escuela de la colonia El Mirador que ya dañó varios carros',
  estado,
  creadoEn: '2026-10-20T15:00:00.000Z',
  esperaRespuesta: estado === 'en_espera',
  confirmacionVenceEn: null,
  ...cambios,
})

const RESUMEN = {
  porEstado: { nueva: 0, en_revision: 0, asignada: 0, en_proceso: 0, en_espera: 1, resuelta: 1, cerrada: 1, rechazada: 0 },
  total: 3,
}

// "Mis quejas" con filtros a 360×740 (SPEC 38): los chips se desplazan dentro de su fila, sin scroll en la página.
test('el vecino filtra sus quejas sin scroll horizontal, y el grupo queda en la URL', async ({ page }) => {
  await simular(page, 'vecino', {
    'GET /tickets': (route, url) => {
      const estados = url.searchParams.getAll('estado')
      const todas = [
        queja(1, 'en_espera'),
        queja(2, 'resuelta', { confirmacionVenceEn: '2099-10-31T05:59:59.999Z' }),
        queja(3, 'cerrada'),
      ]
      const datos = estados.length === 0 ? todas : todas.filter((t) => estados.includes(t.estado))
      return json(route, { datos, pagina: 1, tamano: 20, total: datos.length })
    },
    'GET /tickets/resumen': (route) => json(route, RESUMEN),
  })

  await page.goto('/tickets')
  await expect(page.getByRole('button', { name: 'Todas (3)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/Confirma la solución antes del/)).toBeVisible()
  await sinScrollHorizontal(page)

  await page.getByRole('button', { name: 'Finalizadas (1)' }).click()
  await expect(page).toHaveURL(/\?grupo=finalizadas$/)
  await expect(page.getByRole('link', { name: 'Ver la queja Q-2026-000003' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver la queja Q-2026-000001' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Finalizadas (1)' })).toHaveAttribute('aria-pressed', 'true')
  await sinScrollHorizontal(page)
})
