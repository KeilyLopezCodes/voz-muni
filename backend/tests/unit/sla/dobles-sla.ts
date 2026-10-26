import type { SlaService } from '../../../src/application/services/sla.service';
import type { CambiosSla, EstadoSla } from '../../../src/domain/sla/vencimientos';

// Seguimiento de una queja sin SLA calculado, para los dobles de TicketParaTransicion (SPEC 30).
export const SLA_VACIO: EstadoSla = {
  creadoEn: new Date('2026-10-20T15:00:00.000Z'),
  venceRespuesta: null,
  venceResolucion: null,
  primeraRespuestaEn: null,
  inicioResolucion: null,
  pausaMinutos: 0,
  pausadoDesde: null,
  restanteMinutos: null,
};

// SlaService que no calcula nada y registra a qué momento lo llamaron. Las pruebas del cálculo están en
// sla.service.test.ts y contra Postgres en tests/db/sla.api.test.ts.
export class SlaNulo implements Pick<SlaService, 'alAceptar' | 'alIniciar' | 'alPonerEnEspera' | 'alReanudar' | 'alReabrir'> {
  readonly llamadas: string[] = [];

  async alAceptar(): Promise<CambiosSla> {
    this.llamadas.push('alAceptar');
    return {};
  }

  alIniciar(): CambiosSla {
    this.llamadas.push('alIniciar');
    return {};
  }

  async alPonerEnEspera(): Promise<CambiosSla> {
    this.llamadas.push('alPonerEnEspera');
    return {};
  }

  async alReanudar(): Promise<CambiosSla> {
    this.llamadas.push('alReanudar');
    return {};
  }

  async alReabrir(): Promise<CambiosSla> {
    this.llamadas.push('alReabrir');
    return {};
  }
}
