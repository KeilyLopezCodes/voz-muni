import { CLAVE_JORNADA_LABORAL, type JornadaLaboral, minutosPorJornada, validarJornada } from '../../domain/calendario/jornada';
import { fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../domain/calendario/tiempo-habil';
import type { CalendarioRepository } from '../../domain/repositories/calendario-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import * as reglas from '../../domain/sla/vencimientos';
import type { CalculadoraHabil, CambiosSla, EstadoSla, PlazoMinutos } from '../../domain/sla/vencimientos';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export const CLAVE_UMBRAL_ALERTA = 'sla_umbral_alerta';

// Lo que usan los casos de uso; las pruebas lo reemplazan por uno que no mueve plazos.
export type MotorSla = Pick<SlaService, 'alAceptar' | 'alIniciar' | 'alPonerEnEspera' | 'alReanudar' | 'alReabrir'>;

export interface ClasificacionSla {
  categoriaId: number;
  prioridad: Prioridad | null;
}

// Aplica las reglas de vencimiento en los momentos del ciclo (SPEC 30 y 31). Lee la jornada y el umbral de
// parametros, los días de calendario_laboral y el plazo de politicas_sla en cada uso. Errores: SLA_NO_CONFIGURADO,
// CALENDARIO_INCOMPLETO y PARAMETRO_INVALIDO (todos 409); el caso de uso revierte su transacción.
export class SlaService {
  constructor(
    private readonly parametros: ParametroRepository,
    private readonly calendario: CalendarioRepository,
    private readonly politicas: Pick<PoliticaSlaRepository, 'obtenerPlazo'>,
  ) {}

  async alAceptar(estado: EstadoSla, clasificacion: ClasificacionSla): Promise<CambiosSla> {
    const plazo = await this.plazo(clasificacion, true);
    return conReglasDeNegocio(async () =>
      reglas.alAceptar(estado, plazo!, await this.umbral(), await this.calculadora()),
    );
  }

  alIniciar(estado: EstadoSla, ahora: Date): CambiosSla {
    return reglas.alIniciar(estado, ahora);
  }

  async alPonerEnEspera(estado: EstadoSla, ahora: Date): Promise<CambiosSla> {
    return conReglasDeNegocio(async () => reglas.alPonerEnEspera(estado, ahora, await this.calculadora()));
  }

  async alReanudar(estado: EstadoSla, ahora: Date, clasificacion: ClasificacionSla): Promise<CambiosSla> {
    const plazo = await this.plazo(clasificacion, false);
    return conReglasDeNegocio(async () =>
      reglas.alReanudar(estado, ahora, plazo, await this.umbral(), await this.calculadora()),
    );
  }

  async alReabrir(ahora: Date, clasificacion: ClasificacionSla): Promise<CambiosSla> {
    const plazo = await this.plazo(clasificacion, true);
    return conReglasDeNegocio(async () =>
      reglas.alReabrir(ahora, plazo!, await this.umbral(), await this.calculadora()),
    );
  }

  // Calculadora para otros servicios (reportes de cumplimiento, SPEC 43).
  async calculadora(): Promise<CalculadoraHabil> {
    const jornada = await this.jornada();
    const porJornada = minutosPorJornada(jornada);
    return {
      sumar: async (desde, minutos) => {
        const dias = await this.calendario.diasHabilesDesde(fechaLocal(desde), Math.ceil(minutos / porJornada) + 2);
        return sumarMinutosHabiles(desde, minutos, dias, jornada);
      },
      entre: async (desde, hasta) => {
        if (hasta.getTime() <= desde.getTime()) {
          return 0;
        }
        const dias = await this.calendario.diasHabilesEntre(fechaLocal(desde), fechaLocal(hasta));
        return minutosHabilesEntre(desde, hasta, dias, jornada);
      },
    };
  }

  private async plazo(clasificacion: ClasificacionSla, exigido: boolean): Promise<PlazoMinutos | null> {
    const politica =
      clasificacion.prioridad === null
        ? null
        : await this.politicas.obtenerPlazo(clasificacion.categoriaId, clasificacion.prioridad);
    if (!politica) {
      if (exigido) {
        throw new ErrorDeAplicacion(
          'SLA_NO_CONFIGURADO',
          `La categoría ${clasificacion.categoriaId} no tiene SLA para la prioridad ${String(clasificacion.prioridad)}`,
        );
      }
      return null;
    }
    return { respuesta: politica.horasRespuesta * 60, resolucion: politica.horasResolucion * 60 };
  }

  private async jornada(): Promise<JornadaLaboral> {
    return conReglasDeNegocio(async () => {
      try {
        return validarJornada(await this.parametros.obtener(CLAVE_JORNADA_LABORAL));
      } catch {
        throw new ErrorDeAplicacion('PARAMETRO_INVALIDO', 'jornada_laboral ausente o inválida');
      }
    });
  }

  private async umbral(): Promise<number> {
    const valor = await this.parametros.obtener(CLAVE_UMBRAL_ALERTA);
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 99) {
      throw new ErrorDeAplicacion('PARAMETRO_INVALIDO', 'sla_umbral_alerta debe ser un entero de 1 a 99');
    }
    return valor;
  }
}
