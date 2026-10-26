import { ZONA_MUNICIPAL } from '../../domain/calendario/plazo-confirmacion';

// Fecha y hora para el texto de un correo, en la zona municipal: "lunes, 9 de noviembre de 2026, 23:59" (SPEC 33).
const FECHA_HORA_CORREO = new Intl.DateTimeFormat('es-GT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONA_MUNICIPAL,
});

export function fechaHoraParaCorreo(instante: Date): string {
  return FECHA_HORA_CORREO.format(instante);
}
