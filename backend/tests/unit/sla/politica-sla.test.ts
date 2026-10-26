import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { type PlazoSla, validarMatriz } from '../../../src/domain/sla/politica-sla';
import { PRIORIDADES } from '../../../src/domain/ticket/prioridad';

// La matriz de seed:dev, desordenada a propósito.
const MATRIZ: PlazoSla[] = [
  { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
  { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
  { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
  { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
];

const con = (prioridad: PlazoSla['prioridad'], cambios: Partial<PlazoSla>) =>
  MATRIZ.map((p) => (p.prioridad === prioridad ? { ...p, ...cambios } : p));

function detallesDe(plazos: PlazoSla[]) {
  try {
    validarMatriz(plazos);
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect((error as ReglaDeNegocioError).codigo).toBe('MATRIZ_SLA_INVALIDA');
    return (error as ReglaDeNegocioError).detalles;
  }
  throw new Error('la matriz debía ser inválida');
}

describe('validarMatriz', () => {
  it('la matriz de seed:dev es válida y sale en el orden de PRIORIDADES', () => {
    const matriz = validarMatriz(MATRIZ);
    expect(matriz.map((p) => p.prioridad)).toEqual([...PRIORIDADES]);
    expect(matriz).toEqual([MATRIZ[3], MATRIZ[2], MATRIZ[1], MATRIZ[0]]);
  });

  it('si falta baja → PRIORIDAD_FALTANTE', () => {
    expect(detallesDe(MATRIZ.slice(0, 3))).toEqual([{ prioridad: 'baja', campo: null, problema: 'PRIORIDAD_FALTANTE' }]);
  });

  it('alta dos veces → PRIORIDAD_DUPLICADA', () => {
    const plazos = [...MATRIZ, { prioridad: 'alta' as const, horasRespuesta: 8, horasResolucion: 48 }];
    expect(detallesDe(plazos)).toEqual([{ prioridad: 'alta', campo: null, problema: 'PRIORIDAD_DUPLICADA' }]);
  });

  it.each([0, -1, 1.5, 2147483648, Number.NaN])('%s horas → HORAS_INVALIDAS', (horas) => {
    expect(detallesDe(con('urgente', { horasRespuesta: horas }))).toEqual([
      { prioridad: 'urgente', campo: 'horasRespuesta', problema: 'HORAS_INVALIDAS' },
    ]);
  });

  it('acepta el máximo de integer', () => {
    const plazos = MATRIZ.map((p) => ({ ...p, horasRespuesta: 2147483647, horasResolucion: 2147483647 }));
    expect(() => validarMatriz(plazos)).not.toThrow();
  });

  it('media con 80/72 → RESPUESTA_MAYOR_QUE_RESOLUCION', () => {
    expect(detallesDe(con('media', { horasRespuesta: 80, horasResolucion: 72 }))).toContainEqual({
      prioridad: 'media',
      campo: 'horasRespuesta',
      problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION',
    });
  });

  it('alta con más horas de resolución que media → NO_MONOTONA en media', () => {
    expect(detallesDe(con('alta', { horasResolucion: 80 }))).toEqual([
      { prioridad: 'media', campo: 'horasResolucion', problema: 'NO_MONOTONA' },
    ]);
  });

  it('urgente con más horas de respuesta que alta → NO_MONOTONA en alta', () => {
    expect(detallesDe(con('urgente', { horasRespuesta: 9 }))).toEqual([
      { prioridad: 'alta', campo: 'horasRespuesta', problema: 'NO_MONOTONA' },
    ]);
  });

  it('los valores iguales entre prioridades son válidos', () => {
    const plazos = MATRIZ.map((p) => ({ ...p, horasRespuesta: 8, horasResolucion: 48 }));
    expect(() => validarMatriz(plazos)).not.toThrow();
  });

  it('reporta varios problemas a la vez', () => {
    const plazos: PlazoSla[] = [
      { prioridad: 'urgente', horasRespuesta: 0, horasResolucion: 24 },
      { prioridad: 'alta', horasRespuesta: 60, horasResolucion: 50 },
      { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
    ];
    expect(detallesDe(plazos)).toEqual(
      expect.arrayContaining([
        { prioridad: 'baja', campo: null, problema: 'PRIORIDAD_FALTANTE' },
        { prioridad: 'urgente', campo: 'horasRespuesta', problema: 'HORAS_INVALIDAS' },
        { prioridad: 'alta', campo: 'horasRespuesta', problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION' },
        { prioridad: 'media', campo: 'horasRespuesta', problema: 'NO_MONOTONA' },
      ]),
    );
  });
});
