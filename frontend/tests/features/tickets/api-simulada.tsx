import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { CategoriaFormulario, LimitesMunicipio, Zona } from '../../../src/features/tickets/api/registro-api'

// Ayudas de las pruebas del formulario de queja: fetch simulado por ruta y QueryClient sin reintentos.

export type Manejador = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>

export function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const CATEGORIAS: CategoriaFormulario[] = [
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

export const ZONAS: Zona[] = [
  { id: 10, nombre: 'Zona 1', tipo: 'zona' },
  { id: 11, nombre: 'El Mirador', tipo: 'colonia' },
]

export const LIMITES: LimitesMunicipio = { latMin: 14.5, latMax: 14.7, lngMin: -90.6, lngMax: -90.4 }

// Catálogos del formulario; `limites: null` simula un municipio sin caja configurada.
export function rutasCatalogos({
  categorias = CATEGORIAS,
  limites = LIMITES,
}: { categorias?: CategoriaFormulario[]; limites?: LimitesMunicipio | null } = {}): Record<string, Manejador> {
  return {
    'GET /categorias': () => respuesta(200, categorias),
    'GET /zonas': () => respuesta(200, ZONAS),
    'GET /parametros/limites-municipio': () => respuesta(200, { limites }),
  }
}

// "GET /categorias" → manejador. Las rutas sin manejador responden 404.
export function simularApi(rutas: Record<string, Manejador>) {
  const fetchMock = vi.fn<typeof fetch>(async (entrada, init) => {
    const url = new URL(String(entrada), 'http://localhost')
    const ruta = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}`
    const manejador = rutas[ruta]
    return manejador ? manejador(url, init) : respuesta(404, { codigo: 'NO_ENCONTRADO', mensaje: ruta })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderConConsultas(elemento: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{elemento}</QueryClientProvider>
    </MemoryRouter>,
  )
}
