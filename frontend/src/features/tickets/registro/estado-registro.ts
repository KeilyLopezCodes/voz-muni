import type { Rol } from '../../../shared/auth/roles'
import type {
  CampoExtra,
  CanalInterno,
  DatosRegistroTicket,
  LimitesMunicipio,
  ValorExtra,
  VecinoEncontrado,
} from '../api/registro-api'
import { datosExtraParaEnvio } from './validar-datos-extra'

export type Paso = 'solicitante' | 'categoria' | 'descripcion' | 'ubicacion' | 'resumen'

// Vive solo en memoria (React Hook Form): nunca en localStorage ni sessionStorage (SPEC 18).
export interface EstadoRegistro {
  solicitante: VecinoEncontrado | null // solo ventanilla, datos enmascarados
  canal: CanalInterno | null // solo ventanilla
  categoriaId: number | null
  datosExtra: Record<string, ValorExtra>
  titulo: string
  descripcion: string
  zonaId: number | null
  direccion: string
  ubicacion: Punto | null
  // Se suben después de crear la queja (SPEC 24); nunca forman parte del cuerpo de POST /tickets.
  archivos: File[]
}

export const ESTADO_INICIAL: EstadoRegistro = {
  solicitante: null,
  canal: null,
  categoriaId: null,
  datosExtra: {},
  titulo: '',
  descripcion: '',
  zonaId: null,
  direccion: '',
  ubicacion: null,
  archivos: [],
}

// Rangos de SPEC 12 (domain/ticket/ticket.ts), sobre el texto recortado y en caracteres.
export const LIMITES = {
  titulo: { min: 5, max: 150 },
  descripcion: { min: 10, max: 4000 },
  direccion: { min: 5, max: 300 },
} as const

export const largo = (texto: string): number => [...texto.trim()].length

export function enRango(texto: string, { min, max }: { min: number; max: number }): boolean {
  const longitud = largo(texto)
  return longitud >= min && longitud <= max
}

export interface Punto {
  lat: number
  lng: number
}

// Misma regla que validarUbicacion del backend (SPEC 15): dentro de la caja, bordes incluidos,
// después de redondear a 6 decimales.
export function redondearPunto({ lat, lng }: Punto): Punto {
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
}

export function dentroDeLimites(punto: Punto, limites: LimitesMunicipio): boolean {
  const { lat, lng } = redondearPunto(punto)
  return lat >= limites.latMin && lat <= limites.latMax && lng >= limites.lngMin && lng <= limites.lngMax
}

// Cuerpo de POST /api/v1/tickets (SPEC 12). Supone cada paso ya validado.
// solicitanteId y canal solo para la ventanilla; datosExtra se omite si queda vacío, y lat/lng si no hay punto.
export function cuerpoDelRegistro(
  estado: EstadoRegistro,
  { ventanilla, camposExtra }: { ventanilla: boolean; camposExtra: CampoExtra[] },
): DatosRegistroTicket {
  const datosExtra = datosExtraParaEnvio(camposExtra, estado.datosExtra)
  return {
    categoriaId: estado.categoriaId!,
    zonaId: estado.zonaId!,
    titulo: estado.titulo.trim(),
    descripcion: estado.descripcion.trim(),
    direccion: estado.direccion.trim(),
    ...(ventanilla ? { solicitanteId: estado.solicitante!.id, canal: estado.canal! } : {}),
    ...(Object.keys(datosExtra).length > 0 ? { datosExtra } : {}),
    ...(estado.ubicacion ? { lat: estado.ubicacion.lat, lng: estado.ubicacion.lng } : {}),
  }
}

const PASOS_VECINO: Paso[] = ['categoria', 'descripcion', 'ubicacion', 'resumen']
const PASOS_VENTANILLA: Paso[] = ['solicitante', ...PASOS_VECINO]

// vecino:                categoria → descripcion → ubicacion → resumen
// receptor, supervisor:  solicitante → categoria → descripcion → ubicacion → resumen
export function pasosPara(rol: Rol): Paso[] {
  return rol === 'vecino' ? [...PASOS_VECINO] : [...PASOS_VENTANILLA]
}
