import { PRIORIDADES, type PlazoSla, type Prioridad, type ProblemaMatriz } from '../api/politicas-sla-api'

// Copia en el cliente de validarMatriz (backend/src/domain/sla/politica-sla.ts, SPEC 29). El servidor sigue
// decidiendo: un 400 MATRIZ_SLA_INVALIDA se muestra campo por campo. Cambiar las dos juntas.

export type CampoHoras = 'horasRespuesta' | 'horasResolucion'
export const CAMPOS_HORAS: readonly CampoHoras[] = ['horasRespuesta', 'horasResolucion']

// Lo que se escribe en el formulario: texto, para distinguir un campo vacío.
export type ValoresMatriz = Record<Prioridad, Record<CampoHoras, string>>

export type ProblemaCampo = ProblemaMatriz | 'REQUERIDO'
export type ErroresMatriz = Partial<Record<Prioridad, Partial<Record<CampoHoras, ProblemaCampo>>>>

const MAX_INTEGER = 2147483647

const horas = (texto: string): number | null => {
  const limpio = texto.trim()
  if (!/^\d+$/.test(limpio)) return null
  const valor = Number(limpio)
  return valor >= 1 && valor <= MAX_INTEGER ? valor : null
}

// Los valores vacíos o con decimales no se comparan entre prioridades: ya tienen su propio error.
export function validarMatriz(valores: ValoresMatriz): ErroresMatriz {
  const errores: ErroresMatriz = {}
  const marcar = (prioridad: Prioridad, campo: CampoHoras, problema: ProblemaCampo) => {
    errores[prioridad] = { ...errores[prioridad], [campo]: errores[prioridad]?.[campo] ?? problema }
  }

  for (const prioridad of PRIORIDADES) {
    for (const campo of CAMPOS_HORAS) {
      const texto = valores[prioridad][campo]
      if (texto.trim() === '') marcar(prioridad, campo, 'REQUERIDO')
      else if (horas(texto) === null) marcar(prioridad, campo, 'HORAS_INVALIDAS')
    }
    const respuesta = horas(valores[prioridad].horasRespuesta)
    const resolucion = horas(valores[prioridad].horasResolucion)
    if (respuesta !== null && resolucion !== null && respuesta > resolucion) {
      marcar(prioridad, 'horasRespuesta', 'RESPUESTA_MAYOR_QUE_RESOLUCION')
    }
  }

  // urgente ≤ alta ≤ media ≤ baja: desde urgente, se marca la prioridad con menos horas que una más alta.
  for (const campo of CAMPOS_HORAS) {
    let anterior: number | null = null
    for (const prioridad of [...PRIORIDADES].reverse()) {
      const valor = horas(valores[prioridad][campo])
      if (valor === null) continue
      if (anterior !== null && valor < anterior) marcar(prioridad, campo, 'NO_MONOTONA')
      anterior = valor
    }
  }
  return errores
}

export const tieneErrores = (errores: ErroresMatriz) => Object.keys(errores).length > 0

export function valoresIniciales(plazos: readonly PlazoSla[]): ValoresMatriz {
  const valores = Object.fromEntries(
    PRIORIDADES.map((p) => [p, { horasRespuesta: '', horasResolucion: '' }]),
  ) as ValoresMatriz
  for (const plazo of plazos) {
    valores[plazo.prioridad] = {
      horasRespuesta: String(plazo.horasRespuesta),
      horasResolucion: String(plazo.horasResolucion),
    }
  }
  return valores
}

// Solo se llama con una matriz sin errores.
export function aPlazos(valores: ValoresMatriz): PlazoSla[] {
  return PRIORIDADES.map((prioridad) => ({
    prioridad,
    horasRespuesta: Number(valores[prioridad].horasRespuesta.trim()),
    horasResolucion: Number(valores[prioridad].horasResolucion.trim()),
  }))
}
