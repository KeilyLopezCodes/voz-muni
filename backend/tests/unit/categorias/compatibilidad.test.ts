import type { CampoExtra } from '../../../src/domain/categorias/campo-extra';
import { cambiosIncompatibles } from '../../../src/domain/categorias/compatibilidad';

const base = { etiqueta: 'Campo', requerido: false, orden: 0 };
const TEXTO: CampoExtra = { ...base, clave: 't', tipo: 'texto', min: 4, max: 20, patron: '^[0-9]+$' };
const NUMERO: CampoExtra = { ...base, clave: 'n', tipo: 'numero', min: 0, max: 100, entero: false };
const FECHA: CampoExtra = { ...base, clave: 'f', tipo: 'fecha', min: '2020-01-01', max: '2030-12-31', noFutura: false };
const SELECCION: CampoExtra = {
  ...base,
  clave: 's',
  tipo: 'seleccion',
  opciones: [
    { valor: 'a', etiqueta: 'A' },
    { valor: 'b', etiqueta: 'B' },
  ],
};
const SI_NO: CampoExtra = { ...base, clave: 'x', tipo: 'si_no', requerido: true };
const ACTUAL = [TEXTO, NUMERO, FECHA, SELECCION, SI_NO];

// Reemplaza un campo de ACTUAL por su versión modificada.
const con = (cambiado: CampoExtra) => ACTUAL.map((campo) => (campo.clave === cambiado.clave ? cambiado : campo));

describe('cambiosIncompatibles: cambios permitidos', () => {
  it.each<[string, CampoExtra[]]>([
    ['la misma definición', ACTUAL],
    ['etiqueta, ayuda y orden', con({ ...TEXTO, etiqueta: 'Contador', ayuda: 'En el recibo', orden: 9 })],
    ['quitar requerido', con({ ...SI_NO, requerido: false })],
    ['ampliar texto: bajar min, subir max y quitar patron', con({ ...base, clave: 't', tipo: 'texto', min: 1, max: 50 })],
    ['ampliar número: quitar min y max', con({ ...base, clave: 'n', tipo: 'numero', entero: false })],
    ['ampliar fecha: bajar min y subir max', con({ ...FECHA, min: '2010-01-01', max: '2040-12-31' })],
    [
      'agregar una opción y cambiar la etiqueta de otra',
      con({
        ...SELECCION,
        opciones: [
          { valor: 'a', etiqueta: 'A nueva' },
          { valor: 'b', etiqueta: 'B' },
          { valor: 'c', etiqueta: 'C' },
        ],
      }),
    ],
    ['agregar un campo nuevo opcional', [...ACTUAL, { ...base, clave: 'nuevo', tipo: 'si_no' }]],
  ])('%s', (_caso, nueva) => {
    expect(cambiosIncompatibles(ACTUAL, nueva)).toEqual([]);
  });

  it('entero de true a false y noFutura de true a false amplían', () => {
    expect(cambiosIncompatibles([{ ...NUMERO, entero: true }], [NUMERO])).toEqual([]);
    expect(cambiosIncompatibles([{ ...FECHA, noFutura: true }], [FECHA])).toEqual([]);
  });
});

describe('cambiosIncompatibles: cambios bloqueados', () => {
  it.each<[string, CampoExtra[], { campo: string; problema: string }]>([
    ['quitar un campo', ACTUAL.filter((campo) => campo.clave !== 'n'), { campo: 'n', problema: 'CAMPO_ELIMINADO' }],
    ['cambiar el tipo', con({ ...base, clave: 'n', tipo: 'texto', max: 10 }), { campo: 'n', problema: 'TIPO_CAMBIADO' }],
    ['volver requerido', con({ ...TEXTO, requerido: true }), { campo: 't', problema: 'AHORA_REQUERIDO' }],
    [
      'agregar un campo nuevo requerido',
      [...ACTUAL, { ...base, clave: 'nuevo', tipo: 'si_no', requerido: true }],
      { campo: 'nuevo', problema: 'NUEVO_REQUERIDO' },
    ],
    ['subir el min de un texto', con({ ...TEXTO, min: 5 }), { campo: 't', problema: 'LIMITE_ESTRECHADO' }],
    ['bajar el max de un texto', con({ ...TEXTO, max: 19 }), { campo: 't', problema: 'LIMITE_ESTRECHADO' }],
    ['entero de false a true', con({ ...NUMERO, entero: true }), { campo: 'n', problema: 'LIMITE_ESTRECHADO' }],
    ['noFutura de false a true', con({ ...FECHA, noFutura: true }), { campo: 'f', problema: 'LIMITE_ESTRECHADO' }],
    ['bajar el max de una fecha', con({ ...FECHA, max: '2029-12-31' }), { campo: 'f', problema: 'LIMITE_ESTRECHADO' }],
    ['cambiar el patron', con({ ...TEXTO, patron: '^[0-9-]+$' }), { campo: 't', problema: 'PATRON_CAMBIADO' }],
    [
      'quitar una opción',
      con({ ...SELECCION, opciones: [{ valor: 'a', etiqueta: 'A' }] }),
      { campo: 's', problema: 'OPCION_ELIMINADA' },
    ],
  ])('%s', (_caso, nueva, detalle) => {
    expect(cambiosIncompatibles(ACTUAL, nueva)).toContainEqual(detalle);
  });

  it('agregar un min o un max donde no había es LIMITE_ESTRECHADO', () => {
    const sinLimites: CampoExtra = { ...base, clave: 'n', tipo: 'numero', entero: false };

    expect(cambiosIncompatibles([sinLimites], [{ ...sinLimites, min: 1 }])).toEqual([{ campo: 'n', problema: 'LIMITE_ESTRECHADO' }]);
    expect(cambiosIncompatibles([sinLimites], [{ ...sinLimites, max: 9 }])).toEqual([{ campo: 'n', problema: 'LIMITE_ESTRECHADO' }]);
  });

  it('agregar un patron donde no había es PATRON_CAMBIADO', () => {
    const sinPatron: CampoExtra = { ...base, clave: 't', tipo: 'texto', max: 20 };

    expect(cambiosIncompatibles([sinPatron], [{ ...sinPatron, patron: '^a' }])).toEqual([
      { campo: 't', problema: 'PATRON_CAMBIADO' },
    ]);
  });

  it('renombrar un campo es quitar uno y agregar otro', () => {
    const renombrado = ACTUAL.map((campo) => (campo.clave === 'x' ? { ...campo, clave: 'y' } : campo));

    expect(cambiosIncompatibles(ACTUAL, renombrado)).toEqual([
      { campo: 'x', problema: 'CAMPO_ELIMINADO' },
      { campo: 'y', problema: 'NUEVO_REQUERIDO' },
    ]);
  });
});
