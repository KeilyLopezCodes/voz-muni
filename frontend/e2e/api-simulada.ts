import { expect, type Locator, type Page, type Route } from '@playwright/test'

// API, sesión y teselas simuladas para las pruebas e2e del formulario de queja (SPEC 18).

export type Rol = 'vecino' | 'receptor' | 'supervisor' | 'administrador'
type Manejador = (route: Route, url: URL) => Promise<void>

export const CATEGORIAS = [
  {
    id: 1,
    nombre: 'Alumbrado público',
    camposExtra: [
      { clave: 'numero_poste', etiqueta: 'Número de poste', requerido: true, orden: 0, tipo: 'texto', max: 20 },
      { clave: 'hay_cables', etiqueta: '¿Hay cables expuestos?', requerido: false, orden: 1, tipo: 'si_no' },
    ],
  },
  { id: 2, nombre: 'Baches', camposExtra: [] },
]

export const ZONAS = [
  { id: 10, nombre: 'Zona 1', tipo: 'zona' },
  { id: 11, nombre: 'El Mirador', tipo: 'colonia' },
]

export const LIMITES = { latMin: 14.5, latMax: 14.7, lngMin: -90.6, lngMax: -90.4 }

export const VECINO = { id: 31, nombre: 'Ana Pérez', email: 'a***@correo.gt', telefono: '****0000' }

// PNG transparente de 1×1: las teselas no dependen de internet.
const TESELA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

export interface Simulacion {
  // Cuerpos enviados a POST /tickets.
  tickets: unknown[]
}

// Sesión inyectada: un refreshToken en localStorage y /auth/refresh que responde con el rol pedido.
export async function simular(page: Page, rol: Rol, otras: Record<string, Manejador> = {}): Promise<Simulacion> {
  const simulacion: Simulacion = { tickets: [] }

  await page.addInitScript(() => localStorage.setItem('vozmuni.refreshToken', 'refresh-e2e'))
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TESELA }),
  )
  await page.route('**/health', (route) => json(route, 200, { estado: 'ok', baseDeDatos: 'ok' }))

  const rutas: Record<string, Manejador> = {
    'POST /auth/refresh': (route) =>
      json(route, 200, {
        accessToken: 'acceso-e2e',
        accessExpiraEn: new Date(Date.now() + 15 * 60_000).toISOString(),
        refreshToken: 'refresh-e2e',
        refreshExpiraEn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        usuario: { id: 1, nombre: 'Usuario e2e', rol, dependenciaId: null },
      }),
    'GET /categorias': (route) => json(route, 200, CATEGORIAS),
    'GET /zonas': (route) => json(route, 200, ZONAS),
    'GET /parametros/limites-municipio': (route) => json(route, 200, { limites: LIMITES }),
    'GET /vecinos': (route) => json(route, 200, { datos: [VECINO] }),
    'POST /tickets': (route) => {
      simulacion.tickets.push(route.request().postDataJSON())
      return json(route, 201, { id: 7, numero: 'Q-2026-000042', estado: 'nueva', creadoEn: new Date().toISOString() })
    },
    ...otras,
  }

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const clave = `${route.request().method()} ${url.pathname.replace(/^\/api\/v1/, '')}`
    const manejador = rutas[clave]
    await (manejador ? manejador(route, url) : json(route, 404, { codigo: 'NO_ENCONTRADO', mensaje: clave }))
  })

  return simulacion
}

// RNF-14: nada se sale de los 360 px.
export async function sinScrollHorizontal(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

// El botón queda entero dentro del ancho de la pantalla (puede requerir scroll vertical, nunca horizontal).
export async function visibleSinScrollHorizontal(page: Page, boton: Locator): Promise<void> {
  await boton.scrollIntoViewIfNeeded()
  await expect(boton).toBeVisible()
  const caja = await boton.boundingBox()
  const ancho = page.viewportSize()!.width
  expect(caja).not.toBeNull()
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho)
}

export const tituloDelPaso = (page: Page) => page.getByRole('heading', { level: 2 })

// Revisa el diseño del paso actual y avanza con "Siguiente".
export async function avanzar(page: Page, pasoSiguiente: string): Promise<void> {
  await sinScrollHorizontal(page)
  const siguiente = page.getByRole('button', { name: 'Siguiente' })
  await visibleSinScrollHorizontal(page, siguiente)
  await siguiente.click()
  await expect(tituloDelPaso(page)).toHaveText(pasoSiguiente)
}

export async function elegirZona(page: Page, nombre: string): Promise<void> {
  await page.getByRole('combobox', { name: /^Zona, colonia o aldea/ }).fill(nombre)
  await page.getByRole('option', { name: nombre }).click()
}
