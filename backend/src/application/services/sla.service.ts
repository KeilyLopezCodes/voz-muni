import { CLAVE_JORNADA_LABORAL, type JornadaLaboral, minutosPorJornada, validarJornada } from '../../domain/calendario/jornada';
import { fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import { minutosHabilesEntre, sumarMinutosHabiles } from '../../domain/calendario/tiempo-habil';
import type { CalendarioRepository } from '../../domain/repositories/calendario-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { PoliticaSlaRepository } from '../../domain/repositories/politica-sla-repository';
import {
  alAceptar,
  alIniciar,
  alPonerEnEspera,
  alReabrir,
  alReanudar,
  type CambiosSla,
  type EstadoSla,
  type PlazoHoras,
  type RelojHabil,
} from '../../domain/sla/vencimientos';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';

export type TicketConPolitica = EstadoSla & { categoriaId: number; prioridad: Prioridad };

// Único lugar donde se calculan los vencimientos del SLA (RF-27, SPEC 30). Los casos de uso lo llaman dentro de su
// transacción, después del método de dominio, y guardan los CambiosSla con la transición. Si no se puede
// calcular (SLA_NO_CONFIGURADO, CALENDARIO_INCOMPLETO, PARAMETRO_INVALIDO, todos 409), la transacción se revierte.
// Las lecturas (jornada, calendario y política) no necesitan bloqueo: no van en la transacción.
export class SlaService {
  constructor(
    private readonly parametros: ParametroRepository,
    private readonly calendario: Pick<CalendarioRepository, 'diasHabilesDesde' | 'diasHabilesEntre'>,
    private readonly politicas: Pick<PoliticaSlaRepository, 'obtenerCategoria'>,
  ) {}

  // Aceptar en el triage, también al volver a aceptar después de un traslado.
  alAceptar(ticket: TicketConPolitica): Promise<CambiosSla> {
    return conReglasDeNegocio(async () => alAceptar(ticket, await this.plazo(ticket), await this.reloj()));
  }

  alIniciar(ticket: EstadoSla, ahora: Date): CambiosSla {
    return alIniciar(ticket, ahora);
  }

  alPonerEnEspera(ticket: EstadoSla, ahora: Date): Promise<CambiosSla> {
    return conReglasDeNegocio(async () => alPonerEnEspera(ticket, ahora, await this.reloj()));
  }

  // Único camino para salir de la pausa: reanudar (SPEC 22) y la respuesta del solicitante (SPEC 23).
  alReanudar(ticket: EstadoSla, ahora: Date): Promise<CambiosSla> {
    return conReglasDeNegocio(async () => alReanudar(ticket, ahora, await this.reloj()));
  }

  alReabrir(ticket: TicketConPolitica, ahora: Date): Promise<CambiosSla> {
    return conReglasDeNegocio(async () => alReabrir(ticket, await this.plazo(ticket), ahora, await this.reloj()));
  }

  // La política vigente de la categoría y la prioridad (SPEC 29). Nunca se inventa un plazo.
  private async plazo({ categoriaId, prioridad }: TicketConPolitica): Promise<PlazoHoras> {
    const politica = (await this.politicas.obtenerCategoria(categoriaId))?.plazos.find((p) => p.prioridad === prioridad);
    if (!politica) {
      throw new ErrorDeAplicacion(
        'SLA_NO_CONFIGURADO',
        `La categoría ${categoriaId} no tiene política de SLA para la prioridad ${prioridad}`,
      );
    }
    return { horasRespuesta: politica.horasRespuesta, horasResolucion: politica.horasResolucion };
  }

  // La jornada se lee en cada uso, como los parámetros de SPEC 27.
  private async reloj(): Promise<RelojHabil> {
    const jornada: JornadaLaboral = validarJornada(await this.parametros.obtener(CLAVE_JORNADA_LABORAL));
    const porJornada = minutosPorJornada(jornada);
    return {
      // Un día más por si el primero ya no tiene jornada (después del fin o no hábil).
      sumar: async (desde, minutos) =>
        sumarMinutosHabiles(
          desde,
          minutos,
          await this.calendario.diasHabilesDesde(fechaLocal(desde), Math.ceil(minutos / porJornada) + 1),
          jornada,
        ),
      entre: async (desde, hasta) =>
        hasta.getTime() <= desde.getTime()
          ? 0
          : minutosHabilesEntre(
              desde,
              hasta,
              await this.calendario.diasHabilesEntre(fechaLocal(desde), fechaLocal(hasta)),
              jornada,
            ),
    };
  }
}
