import type { DetalleProblema } from '../errors/regla-de-negocio-error';
import type { CampoExtra } from './campo-extra';

// Un límite nuevo estrecha si exige más que el actual. `undefined` = sin límite.
function minEstrechado<T extends number | string>(actual: T | undefined, nuevo: T | undefined): boolean {
  return nuevo !== undefined && (actual === undefined || nuevo > actual);
}

function maxEstrechado<T extends number | string>(actual: T | undefined, nuevo: T | undefined): boolean {
  return nuevo !== undefined && (actual === undefined || nuevo < actual);
}

// Cambios que invalidarían datos ya guardados en quejas de la categoría; vacía si son compatibles (SPEC 14).
// Solo se aplica a categorías con quejas. Se permiten los cambios de presentación y los que amplían lo aceptado.
export function cambiosIncompatibles(actual: CampoExtra[], nueva: CampoExtra[]): DetalleProblema[] {
  const problemas: DetalleProblema[] = [];
  const agregar = (campo: string, problema: string) => problemas.push({ campo, problema });
  const nuevos = new Map(nueva.map((campo) => [campo.clave, campo]));
  const actuales = new Set(actual.map((campo) => campo.clave));

  for (const antes of actual) {
    const despues = nuevos.get(antes.clave);
    if (!despues) {
      agregar(antes.clave, 'CAMPO_ELIMINADO');
      continue;
    }
    if (despues.tipo !== antes.tipo) {
      agregar(antes.clave, 'TIPO_CAMBIADO');
      continue;
    }
    if (!antes.requerido && despues.requerido) {
      agregar(antes.clave, 'AHORA_REQUERIDO');
    }
    for (const problema of cambiosDeTipo(antes, despues)) {
      agregar(antes.clave, problema);
    }
  }

  for (const campo of nueva) {
    if (!actuales.has(campo.clave) && campo.requerido) {
      agregar(campo.clave, 'NUEVO_REQUERIDO');
    }
  }
  return problemas;
}

// `despues` tiene el mismo tipo que `antes`.
function cambiosDeTipo(antes: CampoExtra, despues: CampoExtra): string[] {
  const problemas: string[] = [];
  if (antes.tipo === 'texto' && despues.tipo === 'texto') {
    if (minEstrechado(antes.min ?? 0, despues.min) || maxEstrechado(antes.max, despues.max)) {
      problemas.push('LIMITE_ESTRECHADO');
    }
    // Quitar el patrón amplía; agregarlo o cambiarlo puede dejar fuera valores guardados.
    if (despues.patron !== undefined && despues.patron !== antes.patron) {
      problemas.push('PATRON_CAMBIADO');
    }
  } else if (antes.tipo === 'numero' && despues.tipo === 'numero') {
    if (minEstrechado(antes.min, despues.min) || maxEstrechado(antes.max, despues.max) || (!antes.entero && despues.entero)) {
      problemas.push('LIMITE_ESTRECHADO');
    }
  } else if (antes.tipo === 'fecha' && despues.tipo === 'fecha') {
    if (
      minEstrechado(antes.min, despues.min) ||
      maxEstrechado(antes.max, despues.max) ||
      (!antes.noFutura && despues.noFutura)
    ) {
      problemas.push('LIMITE_ESTRECHADO');
    }
  } else if (antes.tipo === 'seleccion' && despues.tipo === 'seleccion') {
    const valores = new Set(despues.opciones.map((opcion) => opcion.valor));
    if (antes.opciones.some((opcion) => !valores.has(opcion.valor))) {
      problemas.push('OPCION_ELIMINADA');
    }
  }
  return problemas;
}
