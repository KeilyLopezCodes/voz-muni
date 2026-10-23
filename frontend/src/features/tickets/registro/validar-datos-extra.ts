import type { CampoExtra, ValorExtra } from '../api/registro-api'

// Reglas de backend/src/domain/categorias/datos-extra.ts (SPEC 14) replicadas en el cliente.
// El backend sigue siendo la fuente de verdad: un DATOS_EXTRA_INVALIDOS se muestra en su campo.
//
// En el formulario, los valores de texto, número, fecha y selección se guardan como texto (lo que
// se escribió) y los de sí/no como booleano. datosExtraParaEnvio los convierte al tipo JSON final.

export type ProblemaCampo =
  | 'REQUERIDO'
  | 'TIPO_INVALIDO'
  | 'MUY_CORTO'
  | 'MUY_LARGO'
  | 'PATRON'
  | 'MENOR_AL_MINIMO'
  | 'MAYOR_AL_MAXIMO'
  | 'NO_ENTERO'
  | 'FECHA_FUTURA'
  | 'OPCION_INVALIDA'

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
// Se acepta la coma decimal, que algunos teclados de celular escriben con inputMode="decimal".
const NUMERO = /^-?\d+([.,]\d+)?$/

// Día calendario 'AAAA-MM-DD' de `instante` en Guatemala, para la regla noFutura (RNF-23).
export function hoyGuatemala(instante: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(instante)
}

function esFechaValida(valor: string): boolean {
  const partes = FECHA.exec(valor)
  if (!partes) {
    return false
  }
  const [anio, mes, dia] = partes.slice(1).map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
}

// Ausente: undefined, null o un texto vacío después de recortar.
export function estaAusente(valor: ValorExtra | null | undefined): boolean {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')
}

function aNumero(valor: ValorExtra): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null
  }
  const texto = String(valor).trim()
  return NUMERO.test(texto) ? Number(texto.replace(',', '.')) : null
}

// Primer problema del valor de un campo, o null si es válido.
export function validarCampoExtra(
  campo: CampoExtra,
  valor: ValorExtra | null | undefined,
  hoy: string,
): ProblemaCampo | null {
  if (estaAusente(valor)) {
    return campo.requerido ? 'REQUERIDO' : null
  }
  const presente = valor as ValorExtra

  switch (campo.tipo) {
    case 'texto': {
      if (typeof presente !== 'string') return 'TIPO_INVALIDO'
      const texto = presente.trim()
      const largo = [...texto].length
      if (campo.min !== undefined && largo < campo.min) return 'MUY_CORTO'
      if (largo > campo.max) return 'MUY_LARGO'
      if (campo.patron !== undefined && !new RegExp(campo.patron, 'u').test(texto)) return 'PATRON'
      return null
    }
    case 'numero': {
      const numero = aNumero(presente)
      if (numero === null) return 'TIPO_INVALIDO'
      if (campo.min !== undefined && numero < campo.min) return 'MENOR_AL_MINIMO'
      if (campo.max !== undefined && numero > campo.max) return 'MAYOR_AL_MAXIMO'
      if (campo.entero && !Number.isInteger(numero)) return 'NO_ENTERO'
      return null
    }
    case 'fecha': {
      if (typeof presente !== 'string' || !esFechaValida(presente)) return 'TIPO_INVALIDO'
      if (campo.min !== undefined && presente < campo.min) return 'MENOR_AL_MINIMO'
      if (campo.max !== undefined && presente > campo.max) return 'MAYOR_AL_MAXIMO'
      if (campo.noFutura && presente > hoy) return 'FECHA_FUTURA'
      return null
    }
    case 'seleccion':
      return typeof presente === 'string' && campo.opciones.some((opcion) => opcion.valor === presente)
        ? null
        : 'OPCION_INVALIDA'
    case 'si_no':
      return typeof presente === 'boolean' ? null : 'TIPO_INVALIDO'
  }
}

// Cuerpo de datosExtra: solo los campos presentes, textos recortados, números como number y
// sí/no como boolean. Supone valores ya validados con validarCampoExtra.
export function datosExtraParaEnvio(
  campos: CampoExtra[],
  datos: Record<string, ValorExtra | null | undefined>,
): Record<string, ValorExtra> {
  const resultado: Record<string, ValorExtra> = {}
  for (const campo of campos) {
    const valor = datos[campo.clave]
    if (estaAusente(valor)) {
      continue
    }
    const presente = valor as ValorExtra
    if (campo.tipo === 'numero') {
      const numero = aNumero(presente)
      if (numero !== null) resultado[campo.clave] = numero
    } else if (campo.tipo === 'si_no') {
      resultado[campo.clave] = presente
    } else {
      resultado[campo.clave] = String(presente).trim()
    }
  }
  return resultado
}

// Mismo orden que el backend: por `orden` y luego por `clave`.
export function ordenarCampos(campos: CampoExtra[]): CampoExtra[] {
  return [...campos].sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave))
}
