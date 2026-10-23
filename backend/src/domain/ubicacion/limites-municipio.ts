import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Caja geográfica del municipio (RF-10, SPEC 15). La configura el administrador en `parametros`: nunca se fija en el código.
export const CLAVE_LIMITES_MUNICIPIO = 'limites_municipio';

export interface LimitesMunicipio {
  latMin: number;
  latMax: number; // -90 ≤ latMin < latMax ≤ 90
  lngMin: number;
  lngMax: number; // -180 ≤ lngMin < lngMax ≤ 180 (sin cruzar el antimeridiano)
}

export interface Ubicacion {
  lat: number;
  lng: number;
}

const PROPIEDADES = ['latMin', 'latMax', 'lngMin', 'lngMax'] as const;

const esFinito = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);
const latitudValida = (valor: unknown): valor is number => esFinito(valor) && valor >= -90 && valor <= 90;
const longitudValida = (valor: unknown): valor is number => esFinito(valor) && valor >= -180 && valor <= 180;

// Lanza LIMITES_INVALIDOS si falta una propiedad, sobra alguna o no cumple los rangos.
export function validarLimites(valor: unknown): LimitesMunicipio {
  const invalido = (mensaje: string) => new ReglaDeNegocioError('LIMITES_INVALIDOS', mensaje);
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw invalido('Los límites deben ser un objeto { latMin, latMax, lngMin, lngMax }');
  }
  const limites = valor as Record<string, unknown>;
  const claves = Object.keys(limites);
  if (claves.length !== PROPIEDADES.length || !PROPIEDADES.every((propiedad) => claves.includes(propiedad))) {
    throw invalido('Los límites deben tener exactamente latMin, latMax, lngMin y lngMax');
  }
  const { latMin, latMax, lngMin, lngMax } = limites;
  if (!latitudValida(latMin) || !latitudValida(latMax) || latMin >= latMax) {
    throw invalido('Las latitudes deben estar entre -90 y 90, con latMin < latMax');
  }
  if (!longitudValida(lngMin) || !longitudValida(lngMax) || lngMin >= lngMax) {
    throw invalido('Las longitudes deben estar entre -180 y 180, con lngMin < lngMax');
  }
  return { latMin, latMax, lngMin, lngMax };
}

// 6 decimales: la precisión de tickets.lat / tickets.lng, numeric(9,6).
const redondear = (valor: number) => Math.round(valor * 1e6) / 1e6;

// null si no vino ninguna coordenada. Las reglas se revisan en el orden de la spec.
export function validarUbicacion(
  limites: LimitesMunicipio | null,
  lat: number | undefined,
  lng: number | undefined,
): Ubicacion | null {
  if (lat === undefined && lng === undefined) {
    return null;
  }
  if (lat === undefined || lng === undefined) {
    throw new ReglaDeNegocioError('UBICACION_INCOMPLETA', 'Hay que enviar lat y lng juntas');
  }
  if (!latitudValida(lat) || !longitudValida(lng)) {
    throw new ReglaDeNegocioError('UBICACION_INVALIDA', 'lat debe estar entre -90 y 90 y lng entre -180 y 180');
  }
  if (limites === null) {
    throw new ReglaDeNegocioError(
      'UBICACION_NO_CONFIGURADA',
      'El municipio no tiene configurados sus límites; registra la queja sin coordenadas',
    );
  }
  // Los bordes cuentan como dentro.
  if (lat < limites.latMin || lat > limites.latMax || lng < limites.lngMin || lng > limites.lngMax) {
    throw new ReglaDeNegocioError('UBICACION_FUERA_DEL_MUNICIPIO', 'La ubicación queda fuera del municipio');
  }
  return { lat: redondear(lat), lng: redondear(lng) };
}
