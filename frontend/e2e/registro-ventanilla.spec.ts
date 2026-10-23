import { expect, test } from '@playwright/test'
import {
  avanzar,
  elegirZona,
  simular,
  sinScrollHorizontal,
  tituloDelPaso,
  visibleSinScrollHorizontal,
} from './api-simulada'

// Flujo de ventanilla a 360×740 (SPEC 18, RNF-14): el receptor registra a nombre de un vecino.
test.describe('registro de queja en ventanilla', () => {
  test('busca al vecino por teléfono, elige el canal y registra la queja', async ({ page }) => {
    const simulacion = await simular(page, 'receptor')
    await page.goto('/tickets/nueva')

    await expect(tituloDelPaso(page)).toHaveText('Solicitante')
    await expect(page.getByText('Paso 1 de 5')).toBeVisible()
    await sinScrollHorizontal(page)

    await page.getByRole('textbox', { name: /^Teléfono/ }).fill('5555-0000')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByRole('list', { name: 'Vecinos encontrados' })).toContainText('a***@correo.gt · ****0000')
    await sinScrollHorizontal(page)
    await page.getByRole('button', { name: 'Elegir a Ana Pérez' }).click()
    await page.getByRole('radio', { name: 'Teléfono' }).check()
    await avanzar(page, 'Categoría')

    await page.getByRole('radio', { name: 'Baches' }).check()
    await avanzar(page, 'Descripción')

    await page.getByRole('textbox', { name: /^Título/ }).fill('Bache en la calle')
    await page.getByRole('textbox', { name: /^Descripción/ }).fill('Hay un bache enorme frente a la escuela')
    await avanzar(page, 'Ubicación')

    await elegirZona(page, 'Zona 1')
    await page.getByRole('textbox', { name: /^Dirección/ }).fill('Frente al parque central')
    await avanzar(page, 'Revisa y registra')

    await expect(page.getByRole('region', { name: 'Solicitante' })).toContainText('Ana Pérez')
    await sinScrollHorizontal(page)
    const registrar = page.getByRole('button', { name: 'Registrar queja' })
    await visibleSinScrollHorizontal(page, registrar)
    await registrar.click()

    await expect(page.getByRole('heading', { level: 2, name: 'Queja registrada' })).toBeVisible()
    await expect(page.getByText('Dicta este número al vecino:')).toBeVisible()
    await expect(page.getByLabel('Número de queja')).toHaveText('Q-2026-000042')
    await expect(page.getByRole('button', { name: 'Registrar otra' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver mis quejas' })).toHaveCount(0)
    await sinScrollHorizontal(page)

    expect(simulacion.tickets).toEqual([
      {
        categoriaId: 2,
        zonaId: 10,
        titulo: 'Bache en la calle',
        descripcion: 'Hay un bache enorme frente a la escuela',
        direccion: 'Frente al parque central',
        solicitanteId: 31,
        canal: 'telefono',
      },
    ])
  })

  test('da de alta a un vecino nuevo y lo deja elegido', async ({ page }) => {
    await simular(page, 'receptor', {
      'GET /vecinos': (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ datos: [] }) }),
      'POST /vecinos': (route) =>
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            vecino: { id: 40, nombre: 'Juan García', email: null, telefono: '****0000' },
            invitacionEnviada: false,
          }),
        }),
    })
    await page.goto('/tickets/nueva')

    await page.getByRole('textbox', { name: /^Teléfono/ }).fill('55550000')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByText(/^No encontramos vecinos/)).toBeVisible()
    await page.getByRole('button', { name: 'Registrar vecino nuevo' }).click()

    const alta = page.getByRole('region', { name: 'Vecino nuevo' })
    await alta.getByRole('textbox', { name: /^Nombre completo/ }).fill('Juan García')
    await alta.getByRole('textbox', { name: /^DPI/ }).fill('2547 12345 0101')
    await alta.getByRole('textbox', { name: /^Teléfono/ }).fill('5555-0000')
    await sinScrollHorizontal(page)
    await alta.getByRole('button', { name: 'Registrar vecino' }).click()

    await expect(page.getByRole('region', { name: 'Vecino seleccionado' })).toContainText('Juan García')
    await page.getByRole('radio', { name: 'Ventanilla' }).check()
    await avanzar(page, 'Categoría')
  })
})
