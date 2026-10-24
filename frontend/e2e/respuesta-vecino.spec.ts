import { expect, type Route, test } from '@playwright/test'
import { simular, sinScrollHorizontal, visibleSinScrollHorizontal } from './api-simulada'

// SPEC 25: el vecino encuentra la queja en espera en "Mis quejas", lee el pedido y responde desde el detalle.

const PEDIDO = 'Envíe el número de contador'

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

test('el vecino responde una solicitud de información y la queja vuelve a en proceso', async ({ page }) => {
  let estado: 'en_espera' | 'en_proceso' = 'en_espera'
  const comentarios: unknown[] = []

  const listado = () => ({
    datos: [
      {
        id: 5,
        numero: 'Q-2026-000005',
        titulo: 'Fuga de agua en la banqueta frente a la escuela de la colonia',
        estado,
        creadoEn: '2026-10-20T15:00:00.000Z',
        esperaRespuesta: estado === 'en_espera',
      },
      {
        id: 4,
        numero: 'Q-2026-000004',
        titulo: 'Bache en la 5a avenida',
        estado: 'resuelta',
        creadoEn: '2026-10-01T15:00:00.000Z',
        esperaRespuesta: false,
      },
    ],
    pagina: 1,
    tamano: 20,
    total: 2,
  })

  const detalle = () => ({
    id: 5,
    numero: 'Q-2026-000005',
    estado,
    titulo: 'Fuga de agua en la banqueta frente a la escuela de la colonia',
    descripcion: 'El agua sale desde ayer y ya se formó un charco grande.',
    categoria: { id: 2, nombre: 'Agua potable' },
    zona: { id: 10, nombre: 'Zona 1', tipo: 'zona' },
    direccion: '5a avenida 3-20, frente a la escuela',
    dependencia: { id: 4, nombre: 'Aguas Municipales' },
    creadoEn: '2026-10-20T15:00:00.000Z',
    resueltoEn: null,
    cerradoEn: null,
    informacionSolicitada: estado === 'en_espera' ? PEDIDO : null,
    esSolicitante: true,
  })

  await simular(page, 'vecino', {
    'GET /tickets': (route) => json(route, 200, listado()),
    'GET /tickets/5': (route) => json(route, 200, detalle()),
    'GET /tickets/5/comentarios': (route) => json(route, 200, { datos: comentarios }),
    'GET /tickets/5/adjuntos': (route) => json(route, 200, { datos: [] }),
    'POST /tickets/5/comentarios': (route) => {
      const cuerpo = route.request().postDataJSON() as { cuerpo: string; interno: boolean }
      const comentario = {
        id: 9,
        cuerpo: cuerpo.cuerpo,
        interno: cuerpo.interno,
        autor: { id: 1, nombre: 'Usuario e2e', rol: 'vecino' },
        esDelSolicitante: true,
        creadoEn: new Date().toISOString(),
        editadoEn: null,
        editable: true,
      }
      comentarios.push(comentario)
      estado = 'en_proceso'
      return json(route, 201, { comentario, ticket: { id: 5, estado } })
    },
  })

  await page.goto('/tickets')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mis quejas')
  const tarjeta = page.getByRole('link', { name: 'Ver la queja Q-2026-000005' })
  await expect(tarjeta).toContainText('Necesita tu respuesta')
  await expect(tarjeta).toContainText('En espera')
  await sinScrollHorizontal(page)

  await tarjeta.click()
  await expect(page).toHaveURL(/\/tickets\/5$/)
  await expect(page.getByRole('status').filter({ hasText: `La municipalidad necesita: ${PEDIDO}` })).toBeVisible()
  await sinScrollHorizontal(page)

  const responder = page.getByRole('button', { name: 'Responder' })
  await visibleSinScrollHorizontal(page, responder)
  await responder.click()
  const caja = page.getByRole('textbox', { name: 'Escribe un comentario' })
  await expect(caja).toBeFocused()
  await caja.fill('El contador es 123456')
  await page.getByRole('button', { name: 'Enviar' }).click()

  await expect(page.getByText('Gracias, enviamos tu respuesta.')).toBeVisible()
  await expect(page.getByText('El contador es 123456')).toBeVisible()
  await expect(page.getByText('En proceso', { exact: true })).toBeVisible()
  await expect(responder).toHaveCount(0)
  expect(comentarios).toHaveLength(1)
  expect((comentarios[0] as { interno: boolean }).interno).toBe(false)
  await sinScrollHorizontal(page)

  await page.getByRole('link', { name: 'Mis quejas' }).first().click()
  await expect(page).toHaveURL(/\/tickets$/)
  await expect(tarjeta).toContainText('En proceso')
  await expect(tarjeta).not.toContainText('Necesita tu respuesta')
  await sinScrollHorizontal(page)
})
