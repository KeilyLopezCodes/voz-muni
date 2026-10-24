import { type TecnicoCandidato, validarAsignacion } from '../../../src/domain/asignacion/asignacion-tecnico';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

const DEP = 4;
const TECNICO: TecnicoCandidato = { id: 9, rol: 'tecnico', activo: true, dependenciaId: DEP };

function esperarRegla(fn: () => unknown, codigo: string): void {
  let error: unknown;
  try {
    fn();
  } catch (capturado) {
    error = capturado;
  }
  expect(error).toBeInstanceOf(ReglaDeNegocioError);
  expect(error).toMatchObject({ codigo });
}

describe('validarAsignacion', () => {
  it('un técnico activo de la misma dependencia es válido en la primera asignación, sin motivo', () => {
    expect(validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: null, candidato: TECNICO, motivo: undefined })).toEqual(
      { motivo: null },
    );
  });

  it('en la primera asignación el motivo es opcional y se recorta', () => {
    expect(validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: null, candidato: TECNICO, motivo: '  Cerca  ' })).toEqual(
      { motivo: 'Cerca' },
    );
    expect(validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: null, candidato: TECNICO, motivo: '   ' })).toEqual({
      motivo: null,
    });
  });

  it.each<[string, TecnicoCandidato, number | null]>([
    ['de otra dependencia', { ...TECNICO, dependenciaId: 5 }, DEP],
    ['inactivo', { ...TECNICO, activo: false }, DEP],
    ['coordinador', { ...TECNICO, rol: 'coordinador' }, DEP],
    ['sin dependencia', { ...TECNICO, dependenciaId: null }, DEP],
    ['con un ticket sin dependencia', TECNICO, null],
  ])('un técnico %s → TECNICO_NO_ELEGIBLE', (_caso, candidato, ticketDependenciaId) => {
    esperarRegla(
      () => validarAsignacion({ ticketDependenciaId, tecnicoActual: null, candidato, motivo: undefined }),
      'TECNICO_NO_ELEGIBLE',
    );
  });

  it('el mismo técnico ya asignado → TECNICO_SIN_CAMBIO', () => {
    esperarRegla(
      () => validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: 9, candidato: TECNICO, motivo: 'otra vez' }),
      'TECNICO_SIN_CAMBIO',
    );
  });

  it.each([undefined, '', '   '])('reasignar con el motivo %p → MOTIVO_REQUERIDO', (motivo) => {
    esperarRegla(
      () => validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: 7, candidato: TECNICO, motivo }),
      'MOTIVO_REQUERIDO',
    );
  });

  it('reasignar con motivo lo devuelve recortado', () => {
    expect(
      validarAsignacion({ ticketDependenciaId: DEP, tecnicoActual: 7, candidato: TECNICO, motivo: ' Vacaciones ' }),
    ).toEqual({ motivo: 'Vacaciones' });
  });
});
