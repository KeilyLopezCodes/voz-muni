import type { SlaLectura } from '../../src/domain/sla/sla-lectura';
import type { MotorSla } from '../../src/application/services/sla.service';
import type { EstadoSla } from '../../src/domain/sla/vencimientos';

// Estado de SLA de una queja sin vencimientos calculados, para los repositorios falsos.
export function slaVacio(creadoEn = new Date('2026-10-01T15:00:00Z')): EstadoSla {
  return {
    creadoEn,
    venceRespuesta: null,
    venceResolucion: null,
    primeraRespuestaEn: null,
    inicioResolucion: null,
    pausaMinutos: 0,
    pausadoDesde: null,
    restanteMinutos: null,
    alertaRespuestaEn: null,
    alertaResolucionEn: null,
    alertaRespuestaEnviadaEn: null,
    alertaResolucionEnviadaEn: null,
  };
}

// Motor de SLA que no mueve plazos, para las pruebas de los casos de uso que no tratan del SLA.
export const slaNulo: MotorSla = {
  alAceptar: async () => ({}),
  alIniciar: () => ({}),
  alPonerEnEspera: async () => ({}),
  alReanudar: async () => ({}),
  alReabrir: async () => ({}),
};

export const slaLecturaVacia: SlaLectura = {
  venceRespuesta: null,
  primeraRespuestaEn: null,
  venceResolucion: null,
  pausado: false,
  restanteMinutosEnPausa: null,
  escalado: false,
  escaladoEn: null,
  escaladoPor: null,
};
