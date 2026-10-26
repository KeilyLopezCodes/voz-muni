// Reglas de vencimiento del SLA (RF-27, sección 3, SPEC 30). La primera respuesta corre desde el registro hasta
// en_proceso; la resolución, desde el registro (o la última reapertura) hasta resuelta, sin contar en_espera.
// El tiempo hábil lo resuelve un RelojHabil que arma la aplicación con el calendario y la jornada.

export interface EstadoSla {
  creadoEn: Date;
  venceRespuesta: Date | null;
  venceResolucion: Date | null; // null mientras la queja está en espera
  primeraRespuestaEn: Date | null;
  inicioResolucion: Date | null; // creadoEn, o la última reapertura
  pausaMinutos: number; // minutos hábiles en espera desde inicioResolucion
  pausadoDesde: Date | null; // solo en espera
  restanteMinutos: number | null; // solo en espera
}

export type CambiosSla = Partial<Omit<EstadoSla, 'creadoEn'>>;

// Lo que leen las bandejas y el detalle de los internos (SPEC 30).
export interface SlaLectura {
  venceRespuesta: Date | null;
  primeraRespuestaEn: Date | null;
  venceResolucion: Date | null;
  restanteMinutosEnPausa: number | null;
}

// Plazos de la política vigente de la categoría y la prioridad (SPEC 29), en horas hábiles.
export interface PlazoHoras {
  horasRespuesta: number;
  horasResolucion: number;
}

export interface RelojHabil {
  // El instante que resulta de sumar minutos hábiles.
  sumar(desde: Date, minutos: number): Promise<Date>;
  // Minutos hábiles en [desde, hasta); 0 si hasta <= desde.
  entre(desde: Date, hasta: Date): Promise<number>;
}

// Aceptar en el triage, la primera vez o después de un traslado: los dos plazos desde el registro, descontando la
// pausa acumulada. Después de un traslado no hay pausa abierta (trasladar parte de asignada o en_proceso).
export async function alAceptar(estado: EstadoSla, plazo: PlazoHoras, reloj: RelojHabil): Promise<CambiosSla> {
  const inicioResolucion = estado.inicioResolucion ?? estado.creadoEn;
  return {
    inicioResolucion,
    venceRespuesta: await reloj.sumar(estado.creadoEn, plazo.horasRespuesta * 60),
    venceResolucion: await reloj.sumar(inicioResolucion, plazo.horasResolucion * 60 + estado.pausaMinutos),
  };
}

// La primera vez que pasa a en_proceso. Los vencimientos no cambian.
export function alIniciar(estado: EstadoSla, ahora: Date): CambiosSla {
  return estado.primeraRespuestaEn === null ? { primeraRespuestaEn: ahora } : {};
}

// Congela lo que falta de la resolución (0 si ya venció). Una queja sin vencimiento (aceptada antes de SPEC 30) no
// tiene nada que congelar.
export async function alPonerEnEspera(estado: EstadoSla, ahora: Date, reloj: RelojHabil): Promise<CambiosSla> {
  if (estado.venceResolucion === null) {
    return {};
  }
  return {
    restanteMinutos: await reloj.entre(ahora, estado.venceResolucion),
    pausadoDesde: ahora,
    venceResolucion: null,
  };
}

// Sale de la pausa: suma la espera a la pausa acumulada y vuelve a correr desde ahora con lo que faltaba.
export async function alReanudar(estado: EstadoSla, ahora: Date, reloj: RelojHabil): Promise<CambiosSla> {
  if (estado.pausadoDesde === null || estado.restanteMinutos === null) {
    return {};
  }
  return {
    pausaMinutos: estado.pausaMinutos + (await reloj.entre(estado.pausadoDesde, ahora)),
    venceResolucion: await reloj.sumar(ahora, estado.restanteMinutos),
    pausadoDesde: null,
    restanteMinutos: null,
  };
}

// La reapertura reinicia la resolución con el plazo completo. La primera respuesta no cambia.
export async function alReabrir(
  _estado: EstadoSla,
  plazo: PlazoHoras,
  ahora: Date,
  reloj: RelojHabil,
): Promise<CambiosSla> {
  return {
    inicioResolucion: ahora,
    pausaMinutos: 0,
    venceResolucion: await reloj.sumar(ahora, plazo.horasResolucion * 60),
  };
}
