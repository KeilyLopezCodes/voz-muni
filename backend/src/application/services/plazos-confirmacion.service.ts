import { calcularVencimientoConfirmacion, fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import type { CalendarioRepository } from '../../domain/repositories/calendario-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

// Claves de la tabla parametros que carga la migración 0022 (SPEC 27).
export const CLAVE_PLAZO_CONFIRMACION = 'plazo_confirmacion_dias_habiles';
export const CLAVE_MAX_REAPERTURAS = 'max_reaperturas';

// Parámetros del plazo de confirmación y su cálculo (RF-24, SPEC 27). Un parámetro ausente o fuera de rango
// responde PARAMETRO_INVALIDO; un calendario insuficiente, CALENDARIO_INCOMPLETO. Nunca se inventa un valor.
export class PlazosConfirmacionService {
  constructor(
    private readonly parametros: ParametroRepository,
    private readonly calendario: CalendarioRepository,
  ) {}

  plazoDiasHabiles(): Promise<number> {
    return this.enteroEnRango(CLAVE_PLAZO_CONFIRMACION, 1, 30);
  }

  maxReaperturas(): Promise<number> {
    return this.enteroEnRango(CLAVE_MAX_REAPERTURAS, 0, 10);
  }

  // Fin del N-ésimo día hábil posterior a la fecha local de `ahora`.
  async vencimientoConfirmacion(ahora: Date): Promise<Date> {
    const dias = await this.plazoDiasHabiles();
    const habiles = await this.calendario.diasHabilesPosteriores(fechaLocal(ahora), dias);
    return conReglasDeNegocio(async () => calcularVencimientoConfirmacion(habiles, dias));
  }

  private async enteroEnRango(clave: string, minimo: number, maximo: number): Promise<number> {
    const valor = await this.parametros.obtener(clave);
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
      throw new ErrorDeAplicacion(
        'PARAMETRO_INVALIDO',
        `El parámetro ${clave} debe ser un entero de ${minimo} a ${maximo} (valor: ${JSON.stringify(valor)})`,
      );
    }
    return valor;
  }
}
