import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { type PlazoSla, validarMatriz } from '../../../src/domain/sla/politica-sla';

const valida: PlazoSla[] = [
  { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 8 },
  { prioridad: 'alta', horasRespuesta: 4, horasResolucion: 24 },
  { prioridad: 'media', horasRespuesta: 8, horasResolucion: 48 },
  { prioridad: 'baja', horasRespuesta: 8, horasResolucion: 72 },
];

function problemas(plazos: PlazoSla[]) {
  try {
    validarMatriz(plazos);
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    return (error as ReglaDeNegocioError).detalles;
  }
  throw new Error('debía fallar');
}

describe('validarMatriz', () => {
  it('ordena de baja a urgente y acepta valores iguales', () => {
    expect(validarMatriz(valida).map((p) => p.prioridad)).toEqual(['baja', 'media', 'alta', 'urgente']);
  });

  it('reporta faltantes y duplicadas', () => {
    expect(problemas([valida[0], valida[0], valida[1], valida[2]])).toEqual(
      expect.arrayContaining([
        { campo: 'urgente', problema: 'PRIORIDAD_DUPLICADA' },
        { campo: 'baja', problema: 'PRIORIDAD_FALTANTE' },
      ]),
    );
  });

  it('horas inválidas y respuesta mayor que resolución', () => {
    const plazos = valida.map((p) => ({ ...p }));
    plazos[0].horasRespuesta = 0;
    plazos[1].horasResolucion = 1.5;
    plazos[2].horasRespuesta = 60;
    expect(problemas(plazos)).toEqual(
      expect.arrayContaining([
        { campo: 'urgente.horasRespuesta', problema: 'HORAS_INVALIDAS' },
        { campo: 'alta.horasResolucion', problema: 'HORAS_INVALIDAS' },
        { campo: 'media.horasRespuesta', problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION' },
      ]),
    );
  });

  it('marca la prioridad que rompe la monotonía', () => {
    const plazos = valida.map((p) => ({ ...p }));
    plazos[0].horasResolucion = 30; // urgente > alta
    expect(problemas(plazos)).toEqual([{ campo: 'urgente.horasResolucion', problema: 'NO_MONOTONA' }]);
  });
});
