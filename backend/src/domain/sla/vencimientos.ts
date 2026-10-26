import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Reglas de vencimiento del SLA (RF-27, sección 3, SPEC 30). La primera respuesta corre desde el registro hasta
// en_proceso; la resolución, desde el registro (o la última reapertura) hasta resuelta, sin contar en_espera.
// Cada vencimiento lleva el instante de su alerta al umbral configurado (RF-28, SPEC 31).
// El tiempo hábil lo resuelve un RelojHabil que arma la aplicación con el calendario y la jornada.

export const CLAVE_UMBRAL_ALERTA = 'sla_umbral_alerta';

export interface EstadoSla {
  creadoEn: Date;
  venceRespuesta: Date | null;
  venceResolucion: Date | null; // null mientras la queja está en espera
  primeraRespuestaEn: Date | null;
  inicioResolucion: Date | null; // creadoEn, o la última reapertura
  pausaMinutos: number; // minutos hábiles en espera desde inicioResolucion
  pausadoDesde: Date | null; // solo en espera
  restanteMinutos: number | null; // solo en espera
  alertaRespuestaEn: Date | null; // cuándo se llega al umbral del plazo de respuesta (SPEC 31)
  alertaResolucionEn: Date | null; // null mientras la queja está en espera
  alertaRespuestaEnviadaEn: Date | null;
  alertaResolucionEnviadaEn: Date | null;
}

export type CambiosSla = Partial<Omit<EstadoSla, 'creadoEn'>>;

// Lo que leen las bandejas y el detalle de los internos (SPEC 30).
export interface SlaLectura {
  venceRespuesta: Date | null;
  primeraRespuestaEn: Date | null;
  venceResolucion: Date | null;
  restanteMinutosEnPausa: number | null;
}

// Plazos de la política vigente de la categoría y la prioridad (SPEC 29), en horas hábiles, y el umbral de la
// alerta en porcentaje (parametros.sla_umbral_alerta, SPEC 31).
export interface PlazoHoras {
  horasRespuesta: number;
  horasResolucion: number;
  umbralAlerta: number;
}

export interface RelojHabil {
  // El instante que resulta de sumar minutos hábiles.
  sumar(desde: Date, minutos: number): Promise<Date>;
  // Minutos hábiles en [desde, hasta); 0 si hasta <= desde.
  entre(desde: Date, hasta: Date): Promise<number>;
}

// El umbral es un entero de 1 a 99. Lanza PARAMETRO_INVALIDO si no lo es: nunca se inventa un valor.
export function validarUmbralAlerta(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 99) {
    throw new ReglaDeNegocioError('PARAMETRO_INVALIDO', `${CLAVE_UMBRAL_ALERTA} debe ser un entero de 1 a 99`);
  }
  return valor;
}

// Minutos hábiles transcurridos al llegar al umbral de un plazo de `minutos`.
const alUmbral = (minutos: number, umbral: number) => Math.floor((minutos * umbral) / 100);

// Aceptar en el triage, la primera vez o después de un traslado: los dos plazos desde el registro, descontando la
// pausa acumulada. Después de un traslado no hay pausa abierta (trasladar parte de asignada o en_proceso).
// Un plazo recalculado puede volver a alertar: las dos marcas de enviada se reinician.
export async function alAceptar(estado: EstadoSla, plazo: PlazoHoras, reloj: RelojHabil): Promise<CambiosSla> {
  const inicioResolucion = estado.inicioResolucion ?? estado.creadoEn;
  const respuesta = plazo.horasRespuesta * 60;
  const resolucion = plazo.horasResolucion * 60;
  return {
    inicioResolucion,
    venceRespuesta: await reloj.sumar(estado.creadoEn, respuesta),
    venceResolucion: await reloj.sumar(inicioResolucion, resolucion + estado.pausaMinutos),
    // La primera respuesta ya se cumplió una vez (por ejemplo, antes de un traslado): no hay nada que alertar.
    alertaRespuestaEn:
      estado.primeraRespuestaEn === null
        ? await reloj.sumar(estado.creadoEn, alUmbral(respuesta, plazo.umbralAlerta))
        : null,
    alertaResolucionEn: await reloj.sumar(
      inicioResolucion,
      alUmbral(resolucion, plazo.umbralAlerta) + estado.pausaMinutos,
    ),
    alertaRespuestaEnviadaEn: null,
    alertaResolucionEnviadaEn: null,
  };
}

// La primera vez que pasa a en_proceso. Los vencimientos no cambian; la alerta de respuesta ya no hace falta.
export function alIniciar(estado: EstadoSla, ahora: Date): CambiosSla {
  return estado.primeraRespuestaEn === null
    ? { primeraRespuestaEn: ahora, alertaRespuestaEn: null }
    : { alertaRespuestaEn: null };
}

// Congela lo que falta de la resolución (0 si ya venció), y su alerta. Una queja sin vencimiento (aceptada antes
// de SPEC 30) no tiene nada que congelar.
export async function alPonerEnEspera(estado: EstadoSla, ahora: Date, reloj: RelojHabil): Promise<CambiosSla> {
  if (estado.venceResolucion === null) {
    return {};
  }
  return {
    restanteMinutos: await reloj.entre(ahora, estado.venceResolucion),
    pausadoDesde: ahora,
    venceResolucion: null,
    alertaResolucionEn: null,
  };
}

// Sale de la pausa: suma la espera a la pausa acumulada y vuelve a correr desde ahora con lo que faltaba. La alerta
// queda donde falten los mismos minutos que al umbral, o en ahora si ya se pasó. No reinicia la marca de enviada:
// una pausa no devuelve tiempo.
export async function alReanudar(
  estado: EstadoSla,
  plazo: PlazoHoras,
  ahora: Date,
  reloj: RelojHabil,
): Promise<CambiosSla> {
  if (estado.pausadoDesde === null || estado.restanteMinutos === null) {
    return {};
  }
  const resolucion = plazo.horasResolucion * 60;
  const faltanAlUmbral = resolucion - alUmbral(resolucion, plazo.umbralAlerta);
  return {
    pausaMinutos: estado.pausaMinutos + (await reloj.entre(estado.pausadoDesde, ahora)),
    venceResolucion: await reloj.sumar(ahora, estado.restanteMinutos),
    alertaResolucionEn:
      estado.restanteMinutos > faltanAlUmbral ? await reloj.sumar(ahora, estado.restanteMinutos - faltanAlUmbral) : ahora,
    pausadoDesde: null,
    restanteMinutos: null,
  };
}

// La reapertura reinicia la resolución con el plazo completo, y su alerta. La primera respuesta no cambia.
export async function alReabrir(
  _estado: EstadoSla,
  plazo: PlazoHoras,
  ahora: Date,
  reloj: RelojHabil,
): Promise<CambiosSla> {
  const resolucion = plazo.horasResolucion * 60;
  return {
    inicioResolucion: ahora,
    pausaMinutos: 0,
    venceResolucion: await reloj.sumar(ahora, resolucion),
    alertaResolucionEn: await reloj.sumar(ahora, alUmbral(resolucion, plazo.umbralAlerta)),
    alertaResolucionEnviadaEn: null,
  };
}
