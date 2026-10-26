import { esFechaValida, validarDefinicion } from '../../../src/domain/categorias/campo-extra';
import { type DetalleProblema, ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

// Ejemplo de la spec para Agua potable.
const AGUA = [
  {
    clave: 'numero_contador',
    etiqueta: 'Número de contador',
    tipo: 'texto',
    requerido: true,
    orden: 1,
    min: 4,
    max: 20,
    patron: '^[0-9-]+$',
  },
  {
    clave: 'tipo_problema',
    etiqueta: 'Tipo de problema',
    tipo: 'seleccion',
    requerido: true,
    orden: 2,
    opciones: [
      { valor: 'fuga', etiqueta: 'Fuga' },
      { valor: 'sin_servicio', etiqueta: 'Sin servicio' },
    ],
  },
];

const texto = (cambios: Record<string, unknown> = {}) => ({
  clave: 'campo',
  etiqueta: 'Campo',
  tipo: 'texto',
  requerido: false,
  orden: 0,
  max: 50,
  ...cambios,
});

function detallesDe(campos: unknown): DetalleProblema[] {
  try {
    validarDefinicion(campos);
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect((error as ReglaDeNegocioError).codigo).toBe('DEFINICION_INVALIDA');
    return ((error as ReglaDeNegocioError).detalles ?? []) as DetalleProblema[];
  }
  throw new Error('se esperaba DEFINICION_INVALIDA');
}

describe('validarDefinicion', () => {
  it('acepta el ejemplo de Agua potable', () => {
    expect(validarDefinicion(AGUA)).toEqual(AGUA);
  });

  it('acepta los 5 tipos y una lista vacía', () => {
    const cinco = [
      texto({ clave: 'a', orden: 5 }),
      { clave: 'b', etiqueta: 'Monto', tipo: 'numero', requerido: false, orden: 1, min: 0, max: 100, entero: true },
      { clave: 'c', etiqueta: 'Desde', tipo: 'fecha', requerido: false, orden: 2, min: '2020-01-01', noFutura: true },
      { clave: 'd', etiqueta: 'Tipo', tipo: 'seleccion', requerido: true, orden: 3, opciones: [{ valor: 'x', etiqueta: 'X' }] },
      { clave: 'e', etiqueta: '¿Urgente?', tipo: 'si_no', requerido: false, orden: 3, ayuda: 'Marca si hay riesgo' },
    ];

    const resultado = validarDefinicion(cinco);

    expect(resultado.map((c) => c.clave)).toEqual(['b', 'c', 'd', 'e', 'a']); // por orden y luego clave
    expect(validarDefinicion([])).toEqual([]);
  });

  it.each([
    ['una clave con mayúscula', [texto({ clave: 'Numero' })], { campo: 'campos[0]', problema: 'CLAVE_INVALIDA' }],
    ['una clave repetida', [texto(), texto()], { campo: 'campo', problema: 'CLAVE_REPETIDA' }],
    ['21 campos', Array.from({ length: 21 }, (_, i) => texto({ clave: `c${i}` })), { campo: 'campos', problema: 'DEMASIADOS_CAMPOS' }],
    ['texto sin max', [texto({ max: undefined })], { campo: 'campo', problema: 'MAX_INVALIDO' }],
    ['texto con max = 501', [texto({ max: 501 })], { campo: 'campo', problema: 'MAX_INVALIDO' }],
    ['texto con min > max', [texto({ min: 60 })], { campo: 'campo', problema: 'MIN_INVALIDO' }],
    ['un patron que no compila', [texto({ patron: '([a-z' })], { campo: 'campo', problema: 'PATRON_INVALIDO' }],
    ['un patron de 201 caracteres', [texto({ patron: 'a'.repeat(201) })], { campo: 'campo', problema: 'PATRON_INVALIDO' }],
    [
      'numero con min > max',
      [{ clave: 'n', etiqueta: 'N', tipo: 'numero', requerido: false, orden: 0, min: 10, max: 1, entero: false }],
      { campo: 'n', problema: 'MIN_MAYOR_QUE_MAX' },
    ],
    [
      'fecha con min inválido',
      [{ clave: 'f', etiqueta: 'F', tipo: 'fecha', requerido: false, orden: 0, min: '2026-02-30', noFutura: false }],
      { campo: 'f', problema: 'MIN_INVALIDO' },
    ],
    [
      'seleccion sin opciones',
      [{ clave: 's', etiqueta: 'S', tipo: 'seleccion', requerido: false, orden: 0, opciones: [] }],
      { campo: 's', problema: 'OPCIONES_INVALIDAS' },
    ],
    [
      'seleccion con un valor repetido',
      [
        {
          clave: 's',
          etiqueta: 'S',
          tipo: 'seleccion',
          requerido: false,
          orden: 0,
          opciones: [
            { valor: 'a', etiqueta: 'A' },
            { valor: 'a', etiqueta: 'Otra A' },
          ],
        },
      ],
      { campo: 's', problema: 'OPCION_REPETIDA' },
    ],
    ['una propiedad desconocida', [texto({ color: 'rojo' })], { campo: 'campo.color', problema: 'PROPIEDAD_DESCONOCIDA' }],
    ['una propiedad de otro tipo', [texto({ entero: true })], { campo: 'campo.entero', problema: 'PROPIEDAD_DESCONOCIDA' }],
    ['un tipo desconocido', [texto({ tipo: 'archivo' })], { campo: 'campo', problema: 'TIPO_INVALIDO' }],
    ['requerido no booleano', [texto({ requerido: 'si' })], { campo: 'campo', problema: 'REQUERIDO_INVALIDO' }],
    ['orden negativo', [texto({ orden: -1 })], { campo: 'campo', problema: 'ORDEN_INVALIDO' }],
    ['etiqueta vacía', [texto({ etiqueta: '  ' })], { campo: 'campo', problema: 'ETIQUETA_INVALIDA' }],
  ])('rechaza %s', (_caso, campos, detalle) => {
    expect(detallesDe(campos)).toContainEqual(detalle);
  });

  it('acumula un detalle por problema', () => {
    const detalles = detallesDe([texto({ clave: 'X', max: 0, patron: '(' })]);

    expect(detalles).toEqual([
      { campo: 'campos[0]', problema: 'CLAVE_INVALIDA' },
      { campo: 'campos[0]', problema: 'MAX_INVALIDO' },
      { campo: 'campos[0]', problema: 'PATRON_INVALIDO' },
    ]);
  });

  it('algo que no es lista es inválido', () => {
    expect(detallesDe({ campos: [] })).toEqual([{ campo: 'campos', problema: 'NO_ES_LISTA' }]);
  });
});

describe('esFechaValida', () => {
  it('acepta fechas reales AAAA-MM-DD y rechaza las demás', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2024-02-29')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('2026-2-3')).toBe(false);
    expect(esFechaValida(20260101)).toBe(false);
  });
});
