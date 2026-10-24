// Reglas de vencimiento del SLA (RF-26, RF-27, RF-28, SPEC 30 y 31). Son la única casa de estas reglas: los casos de
// uso las llaman a través de SlaService, y los jobs leen los instantes que dejan guardados.

export type TipoPlazo = 'respuesta' | 'resolucion';

export interface EstadoSla {
  creadoEn: Date;
  venceRespuesta: Date | null;
  venceResolucion: Date | null; // null mientras la queja está en en_espera
  primeraRespuestaEn: Date | null;
  inicioResolucion: Date | null; // creado_en o la última reapertura
  pausaMinutos: number; // minutos hábiles en en_espera desde inicioResolucion
  pausadoDesde: Date | null;
  restanteMinutos: number | null; // minutos hábiles de resolución que faltaban al entrar en espera
  alertaRespuestaEn: Date | null; // instante del umbral (80 %) de cada plazo (SPEC 31)
  alertaResolucionEn: Date | null;
  alertaRespuestaEnviadaEn: Date | null;
  alertaResolucionEnviadaEn: Date | null;
}

export type CambiosSla = Partial<Omit<EstadoSla, 'creadoEn'>>;

// Plazo de la política vigente, en minutos hábiles.
export interface PlazoMinutos {
  respuesta: number;
  resolucion: number;
}

// Puerto de cálculo de tiempo hábil: la aplicación lo arma con el calendario y la jornada.
export interface CalculadoraHabil {
  sumar(desde: Date, minutos: number): Promise<Date>;
  entre(desde: Date, hasta: Date): Promise<number>;
}

// Minutos hasta llegar al umbral `u` (de 1 a 99) de un plazo de `total` minutos.
export const hastaUmbral = (total: number, umbral: number) => Math.floor((total * umbral) / 100);

// Aceptar, la primera vez o después de un traslado: los dos plazos corren desde el registro (o la última reapertura),
// descontando la pausa acumulada. Reinicia las marcas de alerta enviada.
export async function alAceptar(
  estado: EstadoSla,
  plazo: PlazoMinutos,
  umbral: number,
  calc: CalculadoraHabil,
): Promise<CambiosSla> {
  const inicioResolucion = estado.inicioResolucion ?? estado.creadoEn;
  return {
    inicioResolucion,
    venceRespuesta: await calc.sumar(estado.creadoEn, plazo.respuesta),
    venceResolucion: await calc.sumar(inicioResolucion, plazo.resolucion + estado.pausaMinutos),
    alertaRespuestaEn:
      estado.primeraRespuestaEn === null ? await calc.sumar(estado.creadoEn, hastaUmbral(plazo.respuesta, umbral)) : null,
    alertaResolucionEn: await calc.sumar(inicioResolucion, hastaUmbral(plazo.resolucion, umbral) + estado.pausaMinutos),
    alertaRespuestaEnviadaEn: null,
    alertaResolucionEnviadaEn: null,
  };
}

// La primera vez que pasa a en_proceso se cumple la primera respuesta. Los vencimientos no cambian.
export function alIniciar(estado: EstadoSla, ahora: Date): CambiosSla {
  return estado.primeraRespuestaEn === null ? { primeraRespuestaEn: ahora, alertaRespuestaEn: null } : {};
}

// La pausa congela el restante y deja el vencimiento en null: nadie ve una fecha engañosa y los jobs la ignoran.
export async function alPonerEnEspera(estado: EstadoSla, ahora: Date, calc: CalculadoraHabil): Promise<CambiosSla> {
  if (estado.venceResolucion === null) {
    return {};
  }
  return {
    restanteMinutos: await calc.entre(ahora, estado.venceResolucion),
    pausadoDesde: ahora,
    venceResolucion: null,
    alertaResolucionEn: null,
  };
}

// Único camino para salir de la pausa: reanudar y la respuesta del vecino (SPEC 22 y 23). Una alerta ya enviada no
// se repite.
export async function alReanudar(
  estado: EstadoSla,
  ahora: Date,
  plazo: PlazoMinutos | null,
  umbral: number,
  calc: CalculadoraHabil,
): Promise<CambiosSla> {
  if (estado.pausadoDesde === null || estado.restanteMinutos === null) {
    return {};
  }
  const restante = estado.restanteMinutos;
  const cambios: CambiosSla = {
    pausaMinutos: estado.pausaMinutos + (await calc.entre(estado.pausadoDesde, ahora)),
    venceResolucion: await calc.sumar(ahora, restante),
    pausadoDesde: null,
    restanteMinutos: null,
  };
  if (plazo) {
    const antes = plazo.resolucion - hastaUmbral(plazo.resolucion, umbral);
    cambios.alertaResolucionEn = restante > antes ? await calc.sumar(ahora, restante - antes) : ahora;
  }
  return cambios;
}

// Reabrir reinicia la resolución desde ahora con el plazo completo. La primera respuesta no cambia.
export async function alReabrir(
  ahora: Date,
  plazo: PlazoMinutos,
  umbral: number,
  calc: CalculadoraHabil,
): Promise<CambiosSla> {
  return {
    inicioResolucion: ahora,
    pausaMinutos: 0,
    pausadoDesde: null,
    restanteMinutos: null,
    venceResolucion: await calc.sumar(ahora, plazo.resolucion),
    alertaResolucionEn: await calc.sumar(ahora, hastaUmbral(plazo.resolucion, umbral)),
    alertaResolucionEnviadaEn: null,
  };
}
