import { type DetalleProblema, ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Campos adicionales por categoría (RF-09, SPEC 14). Son datos que edita el administrador, no código.
export const TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'seleccion', 'si_no'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const MAX_CAMPOS = 20;
export const MAX_TEXTO = 500;
export const MAX_PATRON = 200;
export const MAX_OPCIONES = 50;

interface CampoBase {
  clave: string; // ^[a-z][a-z0-9_]{0,49}$, única dentro de la categoría
  etiqueta: string; // 1–100 caracteres
  ayuda?: string; // 0–300 caracteres
  requerido: boolean;
  orden: number; // entero ≥ 0
}

export interface OpcionSeleccion {
  valor: string;
  etiqueta: string;
}

export type CampoExtra =
  | (CampoBase & { tipo: 'texto'; min?: number; max: number; patron?: string })
  | (CampoBase & { tipo: 'numero'; min?: number; max?: number; entero: boolean })
  | (CampoBase & { tipo: 'fecha'; min?: string; max?: string; noFutura: boolean })
  | (CampoBase & { tipo: 'seleccion'; opciones: OpcionSeleccion[] })
  | (CampoBase & { tipo: 'si_no' });

const CLAVE = /^[a-z][a-z0-9_]{0,49}$/;
const VALOR_OPCION = /^[a-z0-9_]{1,50}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const PROPIEDADES_BASE = ['clave', 'etiqueta', 'ayuda', 'requerido', 'orden', 'tipo'];
const PROPIEDADES_TIPO: Record<TipoCampo, string[]> = {
  texto: ['min', 'max', 'patron'],
  numero: ['min', 'max', 'entero'],
  fecha: ['min', 'max', 'noFutura'],
  seleccion: ['opciones'],
  si_no: [],
};

// 'AAAA-MM-DD' que existe en el calendario (2026-02-30 no).
export function esFechaValida(valor: unknown): valor is string {
  const partes = typeof valor === 'string' ? FECHA.exec(valor) : null;
  if (!partes) {
    return false;
  }
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const esEnteroNoNegativo = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;
const esNumeroFinito = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);
const largo = (texto: string) => [...texto].length;

// Revisa una definición completa. Lanza DEFINICION_INVALIDA con un detalle por problema.
// Devuelve los campos ordenados por `orden` y luego `clave`.
export function validarDefinicion(campos: unknown): CampoExtra[] {
  const problemas: DetalleProblema[] = [];
  const agregar = (campo: string, problema: string) => problemas.push({ campo, problema });

  if (!Array.isArray(campos)) {
    throw new ReglaDeNegocioError('DEFINICION_INVALIDA', 'La definición debe ser una lista de campos', [
      { campo: 'campos', problema: 'NO_ES_LISTA' },
    ]);
  }
  if (campos.length > MAX_CAMPOS) {
    agregar('campos', 'DEMASIADOS_CAMPOS');
  }

  const claves = new Set<string>();
  campos.forEach((campo, indice) => {
    const nombre = esObjeto(campo) && typeof campo.clave === 'string' && CLAVE.test(campo.clave) ? campo.clave : `campos[${indice}]`;
    if (!esObjeto(campo)) {
      agregar(nombre, 'NO_ES_OBJETO');
      return;
    }

    if (typeof campo.clave !== 'string' || !CLAVE.test(campo.clave)) {
      agregar(nombre, 'CLAVE_INVALIDA');
    } else if (claves.has(campo.clave)) {
      agregar(nombre, 'CLAVE_REPETIDA');
    } else {
      claves.add(campo.clave);
    }
    if (typeof campo.etiqueta !== 'string' || largo(campo.etiqueta.trim()) < 1 || largo(campo.etiqueta) > 100) {
      agregar(nombre, 'ETIQUETA_INVALIDA');
    }
    if (campo.ayuda !== undefined && (typeof campo.ayuda !== 'string' || largo(campo.ayuda) > 300)) {
      agregar(nombre, 'AYUDA_INVALIDA');
    }
    if (typeof campo.requerido !== 'boolean') {
      agregar(nombre, 'REQUERIDO_INVALIDO');
    }
    if (!esEnteroNoNegativo(campo.orden)) {
      agregar(nombre, 'ORDEN_INVALIDO');
    }
    if (typeof campo.tipo !== 'string' || !(TIPOS_CAMPO as readonly string[]).includes(campo.tipo)) {
      agregar(nombre, 'TIPO_INVALIDO');
      return;
    }

    const tipo = campo.tipo as TipoCampo;
    const permitidas = [...PROPIEDADES_BASE, ...PROPIEDADES_TIPO[tipo]];
    for (const propiedad of Object.keys(campo)) {
      if (!permitidas.includes(propiedad)) {
        agregar(`${nombre}.${propiedad}`, 'PROPIEDAD_DESCONOCIDA');
      }
    }
    validarPorTipo(tipo, campo, (problema) => agregar(nombre, problema));
  });

  if (problemas.length > 0) {
    throw new ReglaDeNegocioError('DEFINICION_INVALIDA', 'La definición de campos adicionales no es válida', problemas);
  }
  return (campos as CampoExtra[])
    .map((campo) => ({ ...campo }))
    .sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
}

function validarPorTipo(tipo: TipoCampo, campo: Record<string, unknown>, agregar: (problema: string) => void): void {
  switch (tipo) {
    case 'texto': {
      const { min, max, patron } = campo;
      if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > MAX_TEXTO) {
        agregar('MAX_INVALIDO');
      }
      if (min !== undefined && (!esEnteroNoNegativo(min) || (Number.isInteger(max) && min > (max as number)))) {
        agregar('MIN_INVALIDO');
      }
      if (patron !== undefined) {
        if (typeof patron !== 'string' || largo(patron) < 1 || largo(patron) > MAX_PATRON) {
          agregar('PATRON_INVALIDO');
        } else {
          try {
            new RegExp(patron, 'u');
          } catch {
            agregar('PATRON_INVALIDO');
          }
        }
      }
      return;
    }
    case 'numero': {
      const { min, max, entero } = campo;
      if (min !== undefined && !esNumeroFinito(min)) agregar('MIN_INVALIDO');
      if (max !== undefined && !esNumeroFinito(max)) agregar('MAX_INVALIDO');
      if (esNumeroFinito(min) && esNumeroFinito(max) && min > max) agregar('MIN_MAYOR_QUE_MAX');
      if (typeof entero !== 'boolean') agregar('ENTERO_INVALIDO');
      return;
    }
    case 'fecha': {
      const { min, max, noFutura } = campo;
      if (min !== undefined && !esFechaValida(min)) agregar('MIN_INVALIDO');
      if (max !== undefined && !esFechaValida(max)) agregar('MAX_INVALIDO');
      if (esFechaValida(min) && esFechaValida(max) && min > max) agregar('MIN_MAYOR_QUE_MAX');
      if (typeof noFutura !== 'boolean') agregar('NO_FUTURA_INVALIDO');
      return;
    }
    case 'seleccion': {
      const { opciones } = campo;
      if (!Array.isArray(opciones) || opciones.length < 1 || opciones.length > MAX_OPCIONES) {
        agregar('OPCIONES_INVALIDAS');
        return;
      }
      const valores = new Set<string>();
      for (const opcion of opciones) {
        const valida =
          esObjeto(opcion) &&
          Object.keys(opcion).every((k) => k === 'valor' || k === 'etiqueta') &&
          typeof opcion.valor === 'string' &&
          VALOR_OPCION.test(opcion.valor) &&
          typeof opcion.etiqueta === 'string' &&
          largo(opcion.etiqueta.trim()) >= 1 &&
          largo(opcion.etiqueta) <= 100;
        if (!valida) {
          agregar('OPCION_INVALIDA');
        } else if (valores.has(opcion.valor as string)) {
          agregar('OPCION_REPETIDA');
        } else {
          valores.add(opcion.valor as string);
        }
      }
      return;
    }
    case 'si_no':
      return;
  }
}
