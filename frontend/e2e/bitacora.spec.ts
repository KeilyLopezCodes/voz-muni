import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

// La bitácora (SPEC 41) a 360×740: registros en tarjetas, filtros y la tabla de cambios sin scroll horizontal.

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

const REGISTROS = [
  {
    id: 1,
    creadoEn: new Date().toISOString(),
    accion: 'politica_sla.reemplazar',
    entidad: 'categoria',
    entidadId: '10',
    ticketNumero: null,
    usuario: { id: 5, nombre: 'Administradora con un nombre bastante largo de prueba', rol: 'administrador' },
    dependencia: { id: 1, nombre: 'Dirección de Obras Públicas y Mantenimiento Urbano Municipal' },
    ip: '2001:db8:85a3:0000:0000:8a2e:0370:7334',
    detalle: {
      cambios: {
        urgente: { antes: { horasRespuesta: 2, horasResolucion: 8 }, despues: { horasRespuesta: 1, horasResolucion: 4 } },
      },
      datos: { motivo: 'Un motivo largo '.repeat(12).trim() },
    },
  },
  {
    id: 2,
    creadoEn: new Date().toISOString(),
    accion: 'ticket.escalar',
    entidad: 'ticket',
    entidadId: '15',
    ticketNumero: 'Q-2026-000015',
    usuario: null,
    dependencia: { id: 1, nombre: 'Dirección de Obras Públicas y Mantenimiento Urbano Municipal' },
    ip: null,
    detalle: { datos: { plazo: 'resolucion' } },
  },
]

test('la bitácora y su detalle sin scroll horizontal', async ({ page }) => {
  await simular(page, 'supervisor', {
    'GET /bitacora/acciones': (route) => json(route, 200, { datos: [{ accion: 'ticket.escalar', entidad: 'ticket' }] }),
    'GET /bitacora': (route) => json(route, 200, { datos: REGISTROS, siguienteCursor: 'siguiente' }),
    'GET /notificaciones': (route) => json(route, 200, { datos: [], noLeidas: 0 }),
  })

  await page.goto('/bitacora')
  await expect(page.getByRole('heading', { name: 'Cambió las políticas de SLA' })).toBeVisible()
  await expect(page.getByText('VozMuni', { exact: true }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeVisible()
  await sinScrollHorizontal(page)

  await page.getByRole('button', { name: 'Ver detalle' }).first().click()
  await expect(page.getByRole('table', { name: 'Cambios' })).toBeVisible()
  await sinScrollHorizontal(page)
})
