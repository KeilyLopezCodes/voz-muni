import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal } from './api-simulada'

// SPEC 39: el vecino califica la atención de su queja cerrada desde el detalle, a 360×740.

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

test('el vecino califica su queja cerrada sin scroll horizontal', async ({ page }) => {
  let encuesta: unknown = null
  let enviado: unknown = null

  const detalle = () => ({
    id: 5,
    numero: 'Q-2026-000005',
    estado: 'cerrada',
    titulo: 'Fuga de agua en la banqueta frente a la escuela de la colonia',
    descripcion: 'El agua sale desde ayer y ya se formó un charco grande.',
    categoria: { id: 2, nombre: 'Agua potable' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20, frente a la escuela',
    dependencia: { id: 4, nombre: 'Aguas Municipales' },
    creadoEn: '2026-10-20T15:00:00.000Z',
    resueltoEn: '2026-10-24T15:00:00.000Z',
    cerradoEn: '2026-10-25T15:00:00.000Z',
    informacionSolicitada: null,
    esSolicitante: true,
    resolucion: { descripcion: 'Se cambió el tubo dañado.', resueltaEn: '2026-10-24T15:00:00.000Z', resueltaPor: null },
    confirmacion: null,
    sla: null,
    cierreAutomatico: false,
    encuesta,
    puedeCalificar: encuesta === null,
    encuestaVenceEn: encuesta === null ? '2026-11-24T15:00:00.000Z' : null,
  })

  await simular(page, 'vecino', {
    'GET /tickets/5': (route) => json(route, 200, detalle()),
    'GET /tickets/5/comentarios': (route) => json(route, 200, { datos: [] }),
    'GET /tickets/5/adjuntos': (route) => json(route, 200, { datos: [] }),
    'GET /tickets/5/linea-tiempo': (route) => json(route, 200, { datos: [], siguienteCursor: null }),
    'POST /tickets/5/encuesta': (route) => {
      enviado = route.request().postDataJSON()
      encuesta = { calificacion: 2, comentario: 'Tardaron una semana', creadoEn: new Date().toISOString() }
      return json(route, 201, encuesta)
    },
  })

  await page.goto('/tickets/5')
  await expect(page.getByRole('heading', { name: 'Califica la atención' })).toBeVisible()
  await sinScrollHorizontal(page)

  // La estrella visible es la etiqueta del radio, que está oculto visualmente (MUI Rating).
  await page.locator('label').filter({ hasText: /^2 de 5$/ }).click()
  await expect(page.getByRole('radio', { name: '2 de 5' })).toBeChecked()
  await page.getByRole('textbox', { name: /contarnos algo más/ }).fill('Tardaron una semana')
  await page.getByRole('button', { name: 'Enviar calificación' }).click()

  await expect(page.getByText('Gracias por tu opinión.')).toBeVisible()
  await expect(page.getByText('Tu calificación: 2 de 5')).toBeVisible()
  expect(enviado).toEqual({ calificacion: 2, comentario: 'Tardaron una semana' })
  await sinScrollHorizontal(page)
})
