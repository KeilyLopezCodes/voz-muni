import type { CampoExtra } from '../../../src/domain/categorias/campo-extra';
import { hoyGuatemala, validarDatosExtra } from '../../../src/domain/categorias/datos-extra';
import { type DetalleProblema, ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';

const HOY = '2026-10-22';

const base = { etiqueta: 'Campo', requerido: false, orden: 0 };
const CAMPOS: CampoExtra[] = [
  { ...base, clave: 'contador', tipo: 'texto', requerido: true, min: 4, max: 20, patron: '^[0-9-]+$' },
  { ...base, clave: 'litros', tipo: 'numero', min: 0, max: 1000, entero: true },
  { ...base, clave: 'desde', tipo: 'fecha', min: '2020-01-01', noFutura: true },
  {
    ...base,
    clave: 'problema',
    tipo: 'seleccion',
    opciones: [
      { valor: 'fuga', etiqueta: 'Fuga' },
      { valor: 'sin_servicio', etiqueta: 'Sin servicio' },
    ],
  },
  { ...base, clave: 'urgente', tipo: 'si_no' },
];

function detallesDe(datos: unknown, campos: CampoExtra[] = CAMPOS): DetalleProblema[] {
  try {
    validarDatosExtra(campos, datos, HOY);
  } catch (error) {
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect((error as ReglaDeNegocioError).codigo).toBe('DATOS_EXTRA_INVALIDOS');
    return (error as ReglaDeNegocioError).detalles ?? [];
  }
  throw new Error('se esperaba DATOS_EXTRA_INVALIDOS');
}

const valido = { contador: '1234-56' };

describe('validarDatosExtra', () => {
  it('normaliza y guarda solo los campos presentes', () => {
    expect(
      validarDatosExtra(
        CAMPOS,
        { contador: '  1234-56  ', litros: 20, desde: '2026-10-22', problema: 'fuga', urgente: false },
        HOY,
      ),
    ).toEqual({ contador: '1234-56', litros: 20, desde: '2026-10-22', problema: 'fuga', urgente: false });
    expect(validarDatosExtra(CAMPOS, valido, HOY)).toEqual({ contador: '1234-56' });
  });

  it('undefined cuenta como {} y una definición vacía acepta {}', () => {
    expect(validarDatosExtra([], undefined, HOY)).toEqual({});
    expect(detallesDe(undefined)).toEqual([{ campo: 'contador', problema: 'REQUERIDO' }]);
  });

  describe('texto', () => {
    it.each([
      ['   ', 'REQUERIDO'],
      ['12', 'MUY_CORTO'],
      ['1'.repeat(21), 'MUY_LARGO'],
      ['12AB', 'PATRON'],
      [1234, 'TIPO_INVALIDO'],
    ])('%p → %s', (valor, problema) => {
      expect(detallesDe({ contador: valor })).toEqual([{ campo: 'contador', problema }]);
    });
  });

  describe('número', () => {
    it.each([
      ['5', 'TIPO_INVALIDO'],
      [Number.NaN, 'TIPO_INVALIDO'],
      [2.5, 'NO_ENTERO'],
      [-1, 'MENOR_AL_MINIMO'],
      [1001, 'MAYOR_AL_MAXIMO'],
    ])('%p → %s', (valor, problema) => {
      expect(detallesDe({ ...valido, litros: valor })).toEqual([{ campo: 'litros', problema }]);
    });
  });

  describe('fecha', () => {
    it.each([
      ['22/10/2026', 'TIPO_INVALIDO'],
      ['2026-02-30', 'TIPO_INVALIDO'],
      ['2019-12-31', 'MENOR_AL_MINIMO'],
      ['2026-10-23', 'FECHA_FUTURA'],
    ])('%p → %s', (valor, problema) => {
      expect(detallesDe({ ...valido, desde: valor })).toEqual([{ campo: 'desde', problema }]);
    });

    it('hoy en Guatemala es válido aunque en UTC ya sea mañana', () => {
      // 22/10 a las 23:30 en Guatemala = 23/10 05:30 UTC.
      const hoy = hoyGuatemala(new Date('2026-10-23T05:30:00Z'));

      expect(hoy).toBe('2026-10-22');
      expect(validarDatosExtra(CAMPOS, { ...valido, desde: '2026-10-22' }, hoy)).toMatchObject({ desde: '2026-10-22' });
    });
  });

  it('selección: una opción inexistente → OPCION_INVALIDA', () => {
    expect(detallesDe({ ...valido, problema: 'inundacion' })).toEqual([{ campo: 'problema', problema: 'OPCION_INVALIDA' }]);
  });

  it("sí/no: 'true' (texto) → TIPO_INVALIDO", () => {
    expect(detallesDe({ ...valido, urgente: 'true' })).toEqual([{ campo: 'urgente', problema: 'TIPO_INVALIDO' }]);
  });

  it('una clave desconocida → CAMPO_DESCONOCIDO', () => {
    expect(detallesDe({ ...valido, color: 'rojo' })).toEqual([{ campo: 'color', problema: 'CAMPO_DESCONOCIDO' }]);
  });

  it('devuelve todos los errores a la vez', () => {
    expect(detallesDe({ litros: '5', problema: 'x', extra: 1 })).toEqual([
      { campo: 'extra', problema: 'CAMPO_DESCONOCIDO' },
      { campo: 'contador', problema: 'REQUERIDO' },
      { campo: 'litros', problema: 'TIPO_INVALIDO' },
      { campo: 'problema', problema: 'OPCION_INVALIDA' },
    ]);
  });

  it('algo que no es un objeto plano → TIPO_INVALIDO', () => {
    expect(detallesDe([1, 2])).toEqual([{ campo: 'datosExtra', problema: 'TIPO_INVALIDO' }]);
    expect(detallesDe('texto')).toEqual([{ campo: 'datosExtra', problema: 'TIPO_INVALIDO' }]);
  });
});
