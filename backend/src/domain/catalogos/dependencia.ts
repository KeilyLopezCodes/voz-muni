import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Una dependencia no se desactiva mientras tenga categorías activas: sus quejas nuevas no tendrían destino
// (SPEC 19). No se desactiva en cascada; los usuarios y las quejas abiertas no lo impiden (SPEC 40).
export function exigirDesactivable(categoriasActivas: readonly { id: number; nombre: string }[]): void {
  if (categoriasActivas.length > 0) {
    throw new ReglaDeNegocioError(
      'DEPENDENCIA_EN_USO',
      'La dependencia tiene categorías activas: desactívalas o muévelas a otra dependencia primero',
      categoriasActivas.map(({ id, nombre }) => ({ id, nombre })),
    );
  }
}
