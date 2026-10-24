import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { esFinal, type EstadoTicket } from '../ticket/estado-ticket';

// Comentarios públicos y notas internas (RF-19, RF-22, SPEC 23).

export const CUERPO_MAX = 4000;
export const VENTANA_EDICION_MS = 5 * 60 * 1000;

// Devuelve el cuerpo recortado, de 1 a 4000 caracteres.
export function validarCuerpo(cuerpo: string): string {
  const recortado = typeof cuerpo === 'string' ? cuerpo.trim() : '';
  const largo = [...recortado].length;
  if (largo < 1 || largo > CUERPO_MAX) {
    throw new ReglaDeNegocioError('CUERPO_INVALIDO', `El comentario debe tener de 1 a ${CUERPO_MAX} caracteres`);
  }
  return recortado;
}

// En una queja rechazada o cerrada solo caben notas internas: el vecino no reabre por comentarios (RF-24).
export function exigirComentable(estadoTicket: EstadoTicket, interno: boolean): void {
  if (esFinal(estadoTicket) && !interno) {
    throw new ReglaDeNegocioError('QUEJA_FINALIZADA', `La queja está ${estadoTicket}: solo se admiten notas internas`);
  }
}

// El solicitante que comenta en público una queja en espera la reanuda (RF-22). Nadie más lo hace por comentar.
export function debeReanudar({
  estadoTicket,
  autorId,
  solicitanteId,
  interno,
}: {
  estadoTicket: EstadoTicket;
  autorId: number;
  solicitanteId: number;
  interno: boolean;
}): boolean {
  return estadoTicket === 'en_espera' && autorId === solicitanteId && !interno;
}

// El autor edita durante 5 minutos desde que lo creó; el límite exacto cuenta como dentro.
export function exigirEditable(creadoEn: Date, ahora: Date): void {
  if (ahora.getTime() > creadoEn.getTime() + VENTANA_EDICION_MS) {
    throw new ReglaDeNegocioError('EDICION_VENCIDA', 'Pasaron más de 5 minutos: el comentario ya no se puede editar');
  }
}

export function esEditable(creadoEn: Date, ahora: Date): boolean {
  return ahora.getTime() <= creadoEn.getTime() + VENTANA_EDICION_MS;
}
