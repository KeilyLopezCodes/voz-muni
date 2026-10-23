import { type DetalleProblema, ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { type CampoExtra, esFechaValida } from './campo-extra';

export type ValorCampo = string | number | boolean;
export type DatosExtra = Record<string, ValorCampo>;

// Día calendario 'AAAA-MM-DD' de `instante` en Guatemala, para la regla noFutura (RNF-23).
export function hoyGuatemala(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(instante);
}

const esObjetoPlano = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor) && Object.getPrototypeOf(valor) === Object.prototype;

// Ausente: undefined, null o un texto vacío después de recortar.
function estaAusente(valor: unknown): boolean {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

// Valida `datos` contra la definición de su categoría y devuelve los valores normalizados.
// Lanza DATOS_EXTRA_INVALIDOS con todos los problemas a la vez. `hoy` es la fecha en Guatemala.
export function validarDatosExtra(campos: CampoExtra[], datos: unknown, hoy: string): DatosExtra {
  const problemas: DetalleProblema[] = [];
  const agregar = (campo: string, problema: string) => problemas.push({ campo, problema });
  const entrada = datos === undefined ? {} : datos;

  if (!esObjetoPlano(entrada)) {
    throw new ReglaDeNegocioError('DATOS_EXTRA_INVALIDOS', 'datosExtra debe ser un objeto', [
      { campo: 'datosExtra', problema: 'TIPO_INVALIDO' },
    ]);
  }

  const claves = new Set(campos.map((campo) => campo.clave));
  for (const clave of Object.keys(entrada)) {
    if (!claves.has(clave)) {
      agregar(clave, 'CAMPO_DESCONOCIDO');
    }
  }

  const resultado: DatosExtra = {};
  for (const campo of campos) {
    const valor = entrada[campo.clave];
    if (estaAusente(valor)) {
      if (campo.requerido) {
        agregar(campo.clave, 'REQUERIDO');
      }
      continue;
    }
    const normalizado = validarValor(campo, valor, hoy, (problema) => agregar(campo.clave, problema));
    if (normalizado !== undefined) {
      resultado[campo.clave] = normalizado;
    }
  }

  if (problemas.length > 0) {
    throw new ReglaDeNegocioError('DATOS_EXTRA_INVALIDOS', 'Los datos adicionales no son válidos', problemas);
  }
  return resultado;
}

// Devuelve el valor normalizado, o undefined si registró algún problema.
function validarValor(
  campo: CampoExtra,
  valor: unknown,
  hoy: string,
  agregar: (problema: string) => void,
): ValorCampo | undefined {
  let valido = true;
  const problema = (codigo: string) => {
    valido = false;
    agregar(codigo);
  };

  switch (campo.tipo) {
    case 'texto': {
      if (typeof valor !== 'string') {
        problema('TIPO_INVALIDO');
        return undefined;
      }
      const texto = valor.trim();
      const largo = [...texto].length;
      if (campo.min !== undefined && largo < campo.min) problema('MUY_CORTO');
      if (largo > campo.max) {
        problema('MUY_LARGO');
      } else if (campo.patron !== undefined && !new RegExp(campo.patron, 'u').test(texto)) {
        // El patrón solo se evalúa sobre textos dentro del máximo (≤ 500): limita el costo de una regex mala.
        problema('PATRON');
      }
      return valido ? texto : undefined;
    }
    case 'numero': {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        problema('TIPO_INVALIDO');
        return undefined;
      }
      if (campo.min !== undefined && valor < campo.min) problema('MENOR_AL_MINIMO');
      if (campo.max !== undefined && valor > campo.max) problema('MAYOR_AL_MAXIMO');
      if (campo.entero && !Number.isInteger(valor)) problema('NO_ENTERO');
      return valido ? valor : undefined;
    }
    case 'fecha': {
      if (!esFechaValida(valor)) {
        problema('TIPO_INVALIDO');
        return undefined;
      }
      if (campo.min !== undefined && valor < campo.min) problema('MENOR_AL_MINIMO');
      if (campo.max !== undefined && valor > campo.max) problema('MAYOR_AL_MAXIMO');
      if (campo.noFutura && valor > hoy) problema('FECHA_FUTURA');
      return valido ? valor : undefined;
    }
    case 'seleccion': {
      if (typeof valor !== 'string') {
        problema('TIPO_INVALIDO');
        return undefined;
      }
      if (!campo.opciones.some((opcion) => opcion.valor === valor)) {
        problema('OPCION_INVALIDA');
        return undefined;
      }
      return valor;
    }
    case 'si_no': {
      if (typeof valor !== 'boolean') {
        problema('TIPO_INVALIDO');
        return undefined;
      }
      return valor;
    }
  }
}
