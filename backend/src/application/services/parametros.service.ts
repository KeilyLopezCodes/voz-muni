import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import {
  CLAVE_LIMITES_MUNICIPIO,
  type LimitesMunicipio,
  validarLimites,
} from '../../domain/ubicacion/limites-municipio';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

// Parámetros municipales que configura el administrador (SPEC 15). Hoy solo `limites_municipio`.
export class ParametrosService {
  constructor(private readonly parametros: ParametroRepository) {}

  // null hasta que el administrador la configure: sin ella no se aceptan coordenadas.
  async obtenerLimites(): Promise<LimitesMunicipio | null> {
    const valor = await this.parametros.obtener(CLAVE_LIMITES_MUNICIPIO);
    return valor === null ? null : (valor as LimitesMunicipio);
  }

  // No toca los tickets ya registrados: la caja aplica al registrar.
  async guardarLimites(valor: unknown): Promise<LimitesMunicipio> {
    return conReglasDeNegocio(async () => {
      const limites = validarLimites(valor);
      await this.parametros.guardar(CLAVE_LIMITES_MUNICIPIO, limites);
      return limites;
    });
  }
}
