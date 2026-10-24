import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { ESTADOS_TICKET } from '../../../src/domain/ticket/estado-ticket';
import {
  ESTADOS_SOLICITUD,
  exigirPendiente,
  puedeTrasladarse,
  validarSolicitud,
} from '../../../src/domain/traslado/solicitud-traslado';

function codigoDe(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).codigo;
  }
}

describe('validarSolicitud', () => {
  it('devuelve el motivo recortado, con o sin sugerida', () => {
    expect(validarSolicitud({ motivo: '  Es de Agua  ', dependenciaOrigenId: 4, dependenciaSugeridaId: 5 })).toEqual({
      motivo: 'Es de Agua',
    });
    expect(validarSolicitud({ motivo: 'Es de otra', dependenciaOrigenId: 4, dependenciaSugeridaId: null })).toEqual({
      motivo: 'Es de otra',
    });
  });

  it.each(['', '   ', 'a'.repeat(1001)])('el motivo %p → MOTIVO_REQUERIDO', (motivo) => {
    expect(codigoDe(() => validarSolicitud({ motivo, dependenciaOrigenId: 4, dependenciaSugeridaId: null }))).toBe(
      'MOTIVO_REQUERIDO',
    );
  });

  it('acepta un motivo de 1000 caracteres', () => {
    expect(codigoDe(() => validarSolicitud({ motivo: 'a'.repeat(1000), dependenciaOrigenId: 4, dependenciaSugeridaId: null }))).toBeNull();
  });

  it('la sugerida igual a la de origen → DEPENDENCIA_INVALIDA', () => {
    expect(codigoDe(() => validarSolicitud({ motivo: 'x', dependenciaOrigenId: 4, dependenciaSugeridaId: 4 }))).toBe(
      'DEPENDENCIA_INVALIDA',
    );
  });
});

describe('exigirPendiente', () => {
  it('no lanza con pendiente', () => {
    expect(codigoDe(() => exigirPendiente('pendiente'))).toBeNull();
  });

  it.each(ESTADOS_SOLICITUD.filter((estado) => estado !== 'pendiente'))('%s → TRASLADO_YA_RESUELTO', (estado) => {
    expect(codigoDe(() => exigirPendiente(estado))).toBe('TRASLADO_YA_RESUELTO');
  });
});

describe('puedeTrasladarse', () => {
  it.each(ESTADOS_TICKET)('%s', (estado) => {
    expect(puedeTrasladarse(estado)).toBe(estado === 'asignada' || estado === 'en_proceso');
  });
});
