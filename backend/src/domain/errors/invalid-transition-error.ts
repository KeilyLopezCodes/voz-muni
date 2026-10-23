import type { EstadoTicket } from '../ticket/estado-ticket';
import { DomainError } from './domain-error';

export class InvalidTransitionError extends DomainError {
  readonly desde: EstadoTicket;
  readonly hacia: EstadoTicket;

  constructor(desde: EstadoTicket, hacia: EstadoTicket) {
    super('TRANSICION_INVALIDA', `No se permite pasar de ${desde} a ${hacia}`);
    this.desde = desde;
    this.hacia = hacia;
  }
}
