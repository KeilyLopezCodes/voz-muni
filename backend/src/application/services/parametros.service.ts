import { calcularCambios } from '../../domain/auditoria/saneamiento';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import {
  CLAVE_LIMITES_MUNICIPIO,
  type LimitesMunicipio,
  validarLimites,
} from '../../domain/ubicacion/limites-municipio';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

// Parámetros municipales que configura el administrador (SPEC 15). Hoy solo `limites_municipio`.
export class ParametrosService {
  constructor(
    private readonly parametros: ParametroRepository,
    private readonly transaccion: Transaccion, // guardar registra la bitácora en la misma transacción (SPEC 41)
  ) {}

  // null hasta que el administrador la configure: sin ella no se aceptan coordenadas.
  async obtenerLimites(): Promise<LimitesMunicipio | null> {
    const valor = await this.parametros.obtener(CLAVE_LIMITES_MUNICIPIO);
    return valor === null ? null : (valor as LimitesMunicipio);
  }

  // No toca los tickets ya registrados: la caja aplica al registrar.
  async guardarLimites(actorId: number, valor: unknown): Promise<LimitesMunicipio> {
    return conReglasDeNegocio(async () => {
      const limites = validarLimites(valor);
      return this.transaccion.ejecutar(async ({ parametros, auditoria }) => {
        const anterior = await parametros.obtener(CLAVE_LIMITES_MUNICIPIO);
        await parametros.guardar(CLAVE_LIMITES_MUNICIPIO, limites);
        await auditoria.registrar({
          accion: 'parametro.actualizar',
          entidadId: CLAVE_LIMITES_MUNICIPIO,
          usuarioId: actorId,
          dependenciaId: null,
          cambios: calcularCambios({ valor: anterior }, { valor: limites }),
          datos: { clave: CLAVE_LIMITES_MUNICIPIO },
        });
        return limites;
      });
    });
  }
}
