import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { PRIORIDADES, type Prioridad } from '../ticket/prioridad';

// Matriz de plazos de una categoría (RF-26, SPEC 29). Las horas son horas hábiles; convertirlas a fechas contra
// calendario_laboral queda para RF-27.

export interface PlazoSla {
  prioridad: Prioridad;
  horasRespuesta: number; // horas hábiles hasta la primera respuesta
  horasResolucion: number; // horas hábiles hasta la resolución
}

// Las 4 prioridades, en el orden de PRIORIDADES.
export type MatrizSla = readonly PlazoSla[];

export type ProblemaMatriz =
  | 'PRIORIDAD_FALTANTE'
  | 'PRIORIDAD_DUPLICADA'
  | 'HORAS_INVALIDAS' // no es un entero ≥ 1 que quepa en integer
  | 'RESPUESTA_MAYOR_QUE_RESOLUCION'
  | 'NO_MONOTONA'; // una prioridad más alta tiene más horas que una más baja

export interface DetalleMatriz {
  prioridad: Prioridad;
  campo: 'horasRespuesta' | 'horasResolucion' | null;
  problema: ProblemaMatriz;
}

const CAMPOS = ['horasRespuesta', 'horasResolucion'] as const;
const MAX_INTEGER = 2147483647; // tope de integer en Postgres

const horasValidas = (horas: number) => Number.isInteger(horas) && horas >= 1 && horas <= MAX_INTEGER;

// Devuelve la matriz ordenada por PRIORIDADES. Si no es válida, lanza ReglaDeNegocioError('MATRIZ_SLA_INVALIDA')
// con todos los problemas encontrados.
export function validarMatriz(plazos: readonly PlazoSla[]): MatrizSla {
  const detalles: DetalleMatriz[] = [];
  const porPrioridad = new Map<Prioridad, PlazoSla>();

  for (const plazo of plazos) {
    if (porPrioridad.has(plazo.prioridad)) {
      if (!detalles.some((d) => d.prioridad === plazo.prioridad && d.problema === 'PRIORIDAD_DUPLICADA')) {
        detalles.push({ prioridad: plazo.prioridad, campo: null, problema: 'PRIORIDAD_DUPLICADA' });
      }
      continue;
    }
    porPrioridad.set(plazo.prioridad, plazo);
  }
  for (const prioridad of PRIORIDADES) {
    if (!porPrioridad.has(prioridad)) {
      detalles.push({ prioridad, campo: null, problema: 'PRIORIDAD_FALTANTE' });
    }
  }

  const ordenados = PRIORIDADES.flatMap((prioridad) => {
    const plazo = porPrioridad.get(prioridad);
    return plazo ? [plazo] : [];
  });
  for (const plazo of ordenados) {
    for (const campo of CAMPOS) {
      if (!horasValidas(plazo[campo])) {
        detalles.push({ prioridad: plazo.prioridad, campo, problema: 'HORAS_INVALIDAS' });
      }
    }
    if (horasValidas(plazo.horasRespuesta) && horasValidas(plazo.horasResolucion) && plazo.horasRespuesta > plazo.horasResolucion) {
      detalles.push({ prioridad: plazo.prioridad, campo: 'horasRespuesta', problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION' });
    }
  }
  // urgente ≤ alta ≤ media ≤ baja, por separado en cada columna. Se recorre desde urgente y se marca la prioridad
  // que tiene menos horas que una más alta, comparando con la última que tenga horas válidas.
  for (const campo of CAMPOS) {
    let anterior: PlazoSla | null = null;
    for (const plazo of [...ordenados].reverse()) {
      if (!horasValidas(plazo[campo])) {
        continue;
      }
      if (anterior && plazo[campo] < anterior[campo]) {
        detalles.push({ prioridad: plazo.prioridad, campo, problema: 'NO_MONOTONA' });
      }
      anterior = plazo;
    }
  }

  if (detalles.length > 0) {
    throw new ReglaDeNegocioError('MATRIZ_SLA_INVALIDA', 'La matriz de SLA no es válida', detalles);
  }
  return ordenados;
}
