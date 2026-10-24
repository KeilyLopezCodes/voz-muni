import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Plazo para confirmar o reabrir una solución (RF-24, SPEC 27). Funciones puras: el calendario lo lee la
// aplicación por el puerto CalendarioRepository.

export const ZONA_MUNICIPAL = 'America/Guatemala';

const FECHA_LOCAL = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_MUNICIPAL });

const PARTES_LOCALES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_MUNICIPAL,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// Fecha local (YYYY-MM-DD) de un instante en la zona municipal.
export function fechaLocal(instante: Date): string {
  return FECHA_LOCAL.format(instante);
}

// Fin del último día hábil recibido, a las 23:59:59.999 en ZONA_MUNICIPAL, como instante UTC.
// Lanza CALENDARIO_INCOMPLETO si diasHabiles tiene menos de `cantidad` fechas: nunca se inventa un plazo.
export function calcularVencimientoConfirmacion(
  diasHabiles: readonly string[], // fechas hábiles posteriores a fechaLocal(resueltoEn), en orden
  cantidad: number,
): Date {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new RangeError(`La cantidad de días hábiles debe ser un entero mayor que 0 (recibido ${cantidad})`);
  }
  if (diasHabiles.length < cantidad) {
    throw new ReglaDeNegocioError(
      'CALENDARIO_INCOMPLETO',
      `El calendario laboral no tiene ${cantidad} días hábiles después de la resolución`,
    );
  }
  return finDelDiaLocal(diasHabiles[cantidad - 1]);
}

// 23:59:59.999 de una fecha local de la zona municipal, como instante UTC.
function finDelDiaLocal(fecha: string): Date {
  return instanteLocal(fecha, 23, 59, 59, 999);
}

// Una hora de una fecha local de la zona municipal, como instante UTC. El desfase sale de Intl en la fecha
// concreta, no de una constante; se repite el ajuste por si el desfase cambia entre la estimación y el resultado.
export function instanteLocal(fecha: string, horas: number, minutos: number, segundos = 0, ms = 0): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const deseado = Date.UTC(anio, mes - 1, dia, horas, minutos, segundos, ms);
  let instante = deseado;
  for (let intento = 0; intento < 2; intento++) {
    instante = deseado - desfaseMs(instante);
  }
  return new Date(instante);
}

// Diferencia entre la hora local de la zona y UTC en un instante, en milisegundos (negativa al oeste de Greenwich).
function desfaseMs(instante: number): number {
  const partes = Object.fromEntries(PARTES_LOCALES.formatToParts(new Date(instante)).map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
    instante % 1000,
  );
  return comoUtc - instante;
}
