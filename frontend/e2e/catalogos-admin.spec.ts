import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

// Las pantallas de catálogos (SPEC 40) a 360×740: listas en tarjetas, diálogos y errores sin scroll horizontal.

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

const DEPENDENCIAS = [
  { id: 1, nombre: 'Dirección de Obras Públicas y Mantenimiento Urbano Municipal', activa: true, categoriasActivas: 2, usuariosActivos: 12, quejasAbiertas: 148 },
  { id: 2, nombre: 'Agua Potable', activa: true, categoriasActivas: 0, usuariosActivos: 1, quejasAbiertas: 0 },
]

const CATEGORIAS = [
  {
    id: 10,
    nombre: 'Baches y hundimientos en calles pavimentadas',
    activa: false,
    dependencia: { id: 1, nombre: DEPENDENCIAS[0].nombre, activa: true },
    camposExtra: 3,
    slaCompleto: false,
  },
]

test('dependencias y categorías sin scroll horizontal, con sus diálogos y errores', async ({ page }) => {
  await simular(page, 'administrador', {
    'GET /admin/dependencias': (route) => json(route, 200, { datos: DEPENDENCIAS }),
    'PATCH /admin/dependencias/1': (route) =>
      json(route, 409, {
        codigo: 'DEPENDENCIA_EN_USO',
        mensaje: 'x',
        detalles: [
          { id: 10, nombre: 'Baches y hundimientos en calles pavimentadas' },
          { id: 11, nombre: 'Banquetas rotas' },
        ],
      }),
    'GET /admin/categorias': (route) => json(route, 200, { datos: CATEGORIAS }),
    'PATCH /admin/categorias/10': (route) => json(route, 409, { codigo: 'SLA_INCOMPLETO', mensaje: 'x' }),
  })

  await page.goto('/admin/dependencias')
  await expect(page.getByText(DEPENDENCIAS[0].nombre)).toBeVisible()
  await sinScrollHorizontal(page)

  await page.getByRole('button', { name: `Desactivar ${DEPENDENCIAS[0].nombre}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click()
  await expect(page.getByRole('link', { name: 'Editar Banquetas rotas' })).toBeVisible()
  await sinScrollHorizontal(page)

  await page.goto('/admin/categorias')
  await page.getByRole('switch', { name: 'Mostrar inactivas' }).check()
  await page.getByRole('button', { name: `Activar ${CATEGORIAS[0].nombre}` }).click()
  await expect(page.getByRole('link', { name: 'Definir el SLA' })).toBeVisible()
  await sinScrollHorizontal(page)

  await page.getByRole('button', { name: `Editar ${CATEGORIAS[0].nombre}` }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await sinScrollHorizontal(page)
})
