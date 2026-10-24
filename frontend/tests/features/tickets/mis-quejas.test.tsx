import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketListado } from '../../../src/features/tickets/api/tickets-api'
import { TicketsPage } from '../../../src/features/tickets/pages/TicketsPage'
import comun from '../../../src/locales/es/comun.json'
import tickets from '../../../src/locales/es/tickets.json'
import type { Rol } from '../../../src/shared/auth/roles'
import { SessionProvider } from '../../../src/shared/auth/SessionProvider'
import '../../../src/shared/i18n/i18n'
import { renderConConsultas, respuesta, simularApi } from './api-simulada'

const { misQuejas, estados } = tickets

afterEach(() => {
  vi.unstubAllGlobals()
})

function queja(cambios: Partial<TicketListado> = {}): TicketListado {
  return {
    id: 1,
    numero: 'Q-2026-000001',
    titulo: 'Bache frente a la escuela',
    estado: 'en_proceso',
    creadoEn: '2026-10-20T15:00:00.000Z',
    esperaRespuesta: false,
    ...cambios,
  }
}

function montar(rol: Rol = 'vecino') {
  renderConConsultas(
    <SessionProvider session={{ usuarioId: 7, nombre: 'Vecina Prueba', rol, dependenciaId: null }}>
      <TicketsPage />
    </SessionProvider>,
  )
}

const tarjeta = (numero: string) => screen.findByRole('link', { name: misQuejas.abrir.replace('{{numero}}', numero) })

describe('MisQuejas', () => {
  it('lista las quejas con la marca "Necesita tu respuesta" solo en las que están en espera', async () => {
    const fetchMock = simularApi({
      'GET /tickets': () =>
        respuesta(200, {
          datos: [
            queja({ id: 2, numero: 'Q-2026-000002', estado: 'en_espera', esperaRespuesta: true }),
            queja(),
          ],
          pagina: 1,
          tamano: 20,
          total: 2,
        }),
    })

    montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(misQuejas.titulo)
    const enEspera = await tarjeta('Q-2026-000002')
    expect(enEspera).toHaveAttribute('href', '/tickets/2')
    expect(within(enEspera).getByText(misQuejas.necesitaRespuesta)).toBeInTheDocument()
    const enProceso = await tarjeta('Q-2026-000001')
    expect(enProceso).toHaveTextContent('Bache frente a la escuela')
    expect(enProceso).not.toHaveTextContent(misQuejas.necesitaRespuesta)
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.searchParams.get('pagina')).toBe('1')
  })

  it('muestra el estado con su texto, no solo con el color', async () => {
    simularApi({
      'GET /tickets': () =>
        respuesta(200, {
          datos: [
            queja({ estado: 'en_espera', esperaRespuesta: true }),
            queja({ id: 2, numero: 'Q-2026-000002', estado: 'rechazada' }),
          ],
          pagina: 1,
          tamano: 20,
          total: 2,
        }),
    })

    montar()

    expect(within(await tarjeta('Q-2026-000001')).getByText(estados.en_espera)).toBeInTheDocument()
    expect(within(await tarjeta('Q-2026-000002')).getByText(estados.rechazada)).toBeInTheDocument()
  })

  it('sin quejas, el mensaje vacío lleva a /tickets/nueva', async () => {
    simularApi({ 'GET /tickets': () => respuesta(200, { datos: [], pagina: 1, tamano: 20, total: 0 }) })

    montar()

    expect(await screen.findByText(misQuejas.vacia)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: misQuejas.registrar })).toHaveAttribute('href', '/tickets/nueva')
  })

  it('un error al cargar ofrece reintentar', async () => {
    simularApi({ 'GET /tickets': () => respuesta(500, { codigo: 'ERROR_INTERNO', mensaje: 'x' }) })

    montar()

    expect(await screen.findByRole('alert')).toHaveTextContent(misQuejas.errorCarga)
    expect(screen.getByRole('button', { name: misQuejas.reintentar })).toBeInTheDocument()
  })

  it.each<Rol>(['receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'])(
    'el rol %s ve el placeholder y no pide el listado',
    (rol) => {
      const fetchMock = simularApi({})

      montar(rol)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tickets.listado.titulo)
      expect(screen.getByText(comun.placeholder.proximamente)).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})
