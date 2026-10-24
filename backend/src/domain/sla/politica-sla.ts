import { type DetalleProblema, ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { PRIORIDADES, type Prioridad } from '../ticket/prioridad';

// Plazos de una categoría por prioridad, en horas hábiles (RF-26, SPEC 29).
export interface PlazoSla {
  prioridad: Prioridad;
  horasRespuesta: number; // hasta la primera respuesta (en_proceso)
  horasResolucion: number; // hasta resuelta, sin contar en_espera
}

// Las 4 prioridades, en el orden de PRIORIDADES (de baja a urgente).
export type MatrizSla = readonly PlazoSla[];

const MAX_INTEGER = 2_147_483_647;

const horasValidas = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= MAX_INTEGER;

// Devuelve la matriz ordenada por PRIORIDADES. Si no es válida, lanza MATRIZ_SLA_INVALIDA con todos los problemas.
// detalles[].campo es `<prioridad>.<campo>` o `<prioridad>`.
export function validarMatriz(plazos: readonly PlazoSla[]): MatrizSla {
  const detalles: DetalleProblema[] = [];
  const porPrioridad = new Map<Prioridad, PlazoSla>();
  for (const plazo of plazos) {
    if (porPrioridad.has(plazo.prioridad)) {
      detalles.push({ campo: plazo.prioridad, problema: 'PRIORIDAD_DUPLICADA' });
    }
    porPrioridad.set(plazo.prioridad, plazo);
  }
  for (const prioridad of PRIORIDADES) {
    const plazo = porPrioridad.get(prioridad);
    if (!plazo) {
      detalles.push({ campo: prioridad, problema: 'PRIORIDAD_FALTANTE' });
      continue;
    }
    const respuestaOk = horasValidas(plazo.horasRespuesta);
    const resolucionOk = horasValidas(plazo.horasResolucion);
    if (!respuestaOk) {
      detalles.push({ campo: `${prioridad}.horasRespuesta`, problema: 'HORAS_INVALIDAS' });
    }
    if (!resolucionOk) {
      detalles.push({ campo: `${prioridad}.horasResolucion`, problema: 'HORAS_INVALIDAS' });
    }
    if (respuestaOk && resolucionOk && plazo.horasRespuesta > plazo.horasResolucion) {
      detalles.push({ campo: `${prioridad}.horasRespuesta`, problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION' });
    }
  }
  // Monotonía: de baja a urgente las horas no crecen. Se marca la prioridad que rompe el orden.
  for (const campo of ['horasRespuesta', 'horasResolucion'] as const) {
    for (let i = 1; i < PRIORIDADES.length; i++) {
      const menor = porPrioridad.get(PRIORIDADES[i - 1]);
      const mayor = porPrioridad.get(PRIORIDADES[i]);
      if (menor && mayor && horasValidas(menor[campo]) && horasValidas(mayor[campo]) && mayor[campo] > menor[campo]) {
        detalles.push({ campo: `${PRIORIDADES[i]}.${campo}`, problema: 'NO_MONOTONA' });
      }
    }
  }
  if (detalles.length > 0) {
    throw new ReglaDeNegocioError('MATRIZ_SLA_INVALIDA', 'La matriz de SLA no es válida', detalles);
  }
  return PRIORIDADES.map((prioridad) => porPrioridad.get(prioridad)!);
}
