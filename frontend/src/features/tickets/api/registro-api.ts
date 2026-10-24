import { apiClient } from '../../../shared/api/http-client'

// Contratos de SPEC 12 a 15 que usa el formulario de queja (SPEC 18).

interface CampoBase {
  clave: string
  etiqueta: string
  ayuda?: string
  requerido: boolean
  orden: number
}

export interface OpcionSeleccion {
  valor: string
  etiqueta: string
}

// Misma forma que backend/src/domain/categorias/campo-extra.ts (SPEC 14).
export type CampoExtra =
  | (CampoBase & { tipo: 'texto'; min?: number; max: number; patron?: string })
  | (CampoBase & { tipo: 'numero'; min?: number; max?: number; entero: boolean })
  | (CampoBase & { tipo: 'fecha'; min?: string; max?: string; noFutura: boolean })
  | (CampoBase & { tipo: 'seleccion'; opciones: OpcionSeleccion[] })
  | (CampoBase & { tipo: 'si_no' })

export type TipoCampo = CampoExtra['tipo']

export interface CategoriaFormulario {
  id: number
  nombre: string
  camposExtra: CampoExtra[]
  dependencia: { id: number; nombre: string } // la que recibe la queja al aceptarla (SPEC 19)
}

export interface Zona {
  id: number
  nombre: string
  tipo: string // zona, colonia o aldea
}

export interface LimitesMunicipio {
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}

// Contacto enmascarado (a***@dominio.gt, ****0000); el DPI nunca se devuelve.
export interface VecinoEncontrado {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
}

export type CriterioVecino = { email: string } | { telefono: string } | { dpi: string }

export interface DatosVecinoNuevo {
  nombre: string
  dpi: string
  email?: string
  telefono?: string
}

export interface VecinoCreado {
  vecino: VecinoEncontrado
  invitacionEnviada: boolean
}

// portal queda para el vecino; la ventanilla elige uno de los demás (SPEC 12).
export const CANALES_INTERNOS = ['ventanilla', 'telefono', 'redes', 'correo'] as const
export type CanalInterno = (typeof CANALES_INTERNOS)[number]

export type ValorExtra = string | number | boolean

export interface DatosRegistroTicket {
  categoriaId: number
  zonaId: number
  titulo: string
  descripcion: string
  direccion: string
  solicitanteId?: number
  canal?: CanalInterno
  datosExtra?: Record<string, ValorExtra>
  lat?: number
  lng?: number
}

export interface TicketCreado {
  id: number
  numero: string // Q-AAAA-NNNNNN
  estado: 'nueva'
  creadoEn: string
}

// Claves de TanStack Query de los catálogos del formulario.
export const CLAVES_REGISTRO = {
  categorias: ['tickets', 'registro', 'categorias'],
  zonas: ['tickets', 'registro', 'zonas'],
  limites: ['tickets', 'registro', 'limites-municipio'],
} as const

export function listarCategorias(): Promise<CategoriaFormulario[]> {
  return apiClient.get<CategoriaFormulario[]>('/categorias')
}

export function listarZonas(): Promise<Zona[]> {
  return apiClient.get<Zona[]>('/zonas')
}

// { limites: null } mientras el municipio no configure su caja (SPEC 15).
export function obtenerLimitesMunicipio(): Promise<{ limites: LimitesMunicipio | null }> {
  return apiClient.get<{ limites: LimitesMunicipio | null }>('/parametros/limites-municipio')
}

export function buscarVecinos(criterio: CriterioVecino): Promise<{ datos: VecinoEncontrado[] }> {
  const [campo, valor] = Object.entries(criterio)[0] as [string, string]
  return apiClient.get<{ datos: VecinoEncontrado[] }>(`/vecinos?${new URLSearchParams({ [campo]: valor })}`)
}

export function crearVecino(datos: DatosVecinoNuevo): Promise<VecinoCreado> {
  return apiClient.post<VecinoCreado>('/vecinos', datos)
}

export function crearTicket(datos: DatosRegistroTicket): Promise<TicketCreado> {
  return apiClient.post<TicketCreado>('/tickets', datos)
}
