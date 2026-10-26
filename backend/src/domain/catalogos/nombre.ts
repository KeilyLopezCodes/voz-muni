import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Nombres de dependencias, categorías y zonas (RF-41, SPEC 40). El mismo largo que los CHECK de 0033.
export const NOMBRE_CATALOGO_MAX = 120;

// Recorta, colapsa los espacios internos repetidos y exige de 1 a 120 caracteres: "  Agua   potable " es
// "Agua potable". La unicidad (sin distinguir mayúsculas) la garantizan los índices de la base.
export function normalizarNombre(nombre: string): string {
  const normalizado = nombre.trim().replace(/\s+/g, ' ');
  const largo = [...normalizado].length;
  if (largo < 1 || largo > NOMBRE_CATALOGO_MAX) {
    throw new ReglaDeNegocioError('NOMBRE_INVALIDO', `El nombre debe tener de 1 a ${NOMBRE_CATALOGO_MAX} caracteres`);
  }
  return normalizado;
}
