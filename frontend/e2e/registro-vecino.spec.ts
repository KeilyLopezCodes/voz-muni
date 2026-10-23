import { expect, test } from '@playwright/test'
import {
  avanzar,
  elegirZona,
  simular,
  sinScrollHorizontal,
  tituloDelPaso,
  visibleSinScrollHorizontal,
} from './api-simulada'

// Flujo del vecino a 360×740 (SPEC 18, RNF-14).
test.describe('registro de queja del vecino', () => {
  test('registra una queja con campos adicionales y un punto en el mapa', async ({ page }) => {
    const simulacion = await simular(page, 'vecino')
    await page.goto('/tickets/nueva')

    await expect(page.getByRole('heading', { level: 1, name: 'Nueva queja' })).toBeVisible()
    await expect(tituloDelPaso(page)).toHaveText('Categoría')
    await expect(page.getByText('Paso 1 de 4')).toBeVisible()

    await page.getByRole('radio', { name: 'Alumbrado público' }).check()
    await page.getByRole('textbox', { name: /^Número de poste/ }).fill('P-123')
    await page
      .getByRole('radiogroup', { name: '¿Hay cables expuestos?' })
      .getByRole('radio', { name: 'Sí' })
      .check()
    await avanzar(page, 'Descripción')

    await page.getByRole('textbox', { name: /^Título/ }).fill('Poste sin luz')
    await page.getByRole('textbox', { name: /^Descripción/ }).fill('El poste de la esquina no enciende desde el lunes')
    await avanzar(page, 'Ubicación')

    await elegirZona(page, 'El Mirador')
    await page.getByRole('textbox', { name: /^Dirección/ }).fill('3a avenida y 5a calle')
    // El mapa se ajusta a la caja del municipio: su centro está dentro.
    const mapa = page.getByRole('region', { name: 'Mapa para marcar el lugar' })
    await mapa.scrollIntoViewIfNeeded()
    await expect(mapa.locator('.leaflet-container')).toBeVisible()
    await mapa.click()
    await expect(page.getByText(/^Punto marcado: /)).toBeVisible()
    await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible()
    await avanzar(page, 'Revisa y registra')

    await sinScrollHorizontal(page)
    const registrar = page.getByRole('button', { name: 'Registrar queja' })
    await visibleSinScrollHorizontal(page, registrar)
    await registrar.click()

    await expect(page.getByRole('heading', { level: 2, name: 'Registramos tu queja' })).toBeVisible()
    await expect(page.getByLabel('Número de queja')).toHaveText('Q-2026-000042')
    await expect(page.getByRole('button', { name: 'Copiar número' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver mis quejas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar otra' })).toBeVisible()
    await sinScrollHorizontal(page)

    expect(simulacion.tickets).toHaveLength(1)
    const [cuerpo] = simulacion.tickets as Record<string, unknown>[]
    expect(cuerpo).toMatchObject({
      categoriaId: 1,
      zonaId: 11,
      titulo: 'Poste sin luz',
      direccion: '3a avenida y 5a calle',
      datosExtra: { numero_poste: 'P-123', hay_cables: true },
    })
    expect(cuerpo).not.toHaveProperty('solicitanteId')
    expect(cuerpo).not.toHaveProperty('canal')
    expect(typeof cuerpo.lat).toBe('number')
    expect(typeof cuerpo.lng).toBe('number')
  })

  test('un campo adicional requerido vacío bloquea el avance', async ({ page }) => {
    await simular(page, 'vecino')
    await page.goto('/tickets/nueva')

    await page.getByRole('radio', { name: 'Alumbrado público' }).check()
    await page.getByRole('button', { name: 'Siguiente' }).click()

    await expect(page.getByRole('alert')).toHaveText('Este dato es obligatorio. · 0/20')
    await expect(tituloDelPaso(page)).toHaveText('Categoría')
    await sinScrollHorizontal(page)
  })
})
