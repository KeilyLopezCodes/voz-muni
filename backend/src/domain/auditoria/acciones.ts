// Catálogo cerrado de acciones de la bitácora (RF-42, SPEC 41). Es la única lista válida: Auditoria.registrar rechaza
// cualquier otra, y la base exige el formato entidad.verbo (CHECK bitacora_accion_formato, 0034).
export const ACCIONES_BITACORA = {
  // Quejas
  'ticket.registrar': { entidad: 'ticket' }, // SPEC 12 y 13
  'ticket.tomar': { entidad: 'ticket' }, // SPEC 19
  'ticket.aceptar': { entidad: 'ticket' },
  'ticket.rechazar': { entidad: 'ticket' },
  'ticket.asignar': { entidad: 'ticket' }, // SPEC 20 (asignar y reasignar)
  'ticket.iniciar': { entidad: 'ticket' }, // SPEC 22
  'ticket.poner_en_espera': { entidad: 'ticket' },
  'ticket.reanudar': { entidad: 'ticket' }, // también por la respuesta del vecino (SPEC 23)
  'ticket.resolver': { entidad: 'ticket' },
  'ticket.confirmar': { entidad: 'ticket' }, // SPEC 27
  'ticket.reabrir': { entidad: 'ticket' },
  'ticket.trasladar': { entidad: 'ticket' }, // SPEC 21 (aprobación o traslado directo)
  'ticket.escalar': { entidad: 'ticket' }, // SPEC 32 (sistema)
  'ticket.cerrar_automatico': { entidad: 'ticket' }, // SPEC 33 (sistema)
  'traslado.solicitar': { entidad: 'traslado' }, // SPEC 21
  'traslado.rechazar': { entidad: 'traslado' },
  'traslado.retirar': { entidad: 'traslado' },
  'encuesta.registrar': { entidad: 'encuesta' }, // SPEC 39
  // Administración
  'usuario.crear': { entidad: 'usuario' }, // SPEC 10 y 13
  'usuario.editar': { entidad: 'usuario' },
  'usuario.activar': { entidad: 'usuario' },
  'usuario.desactivar': { entidad: 'usuario' },
  'usuario.desbloquear': { entidad: 'usuario' },
  'dependencia.crear': { entidad: 'dependencia' }, // SPEC 40
  'dependencia.editar': { entidad: 'dependencia' },
  'categoria.crear': { entidad: 'categoria' },
  'categoria.editar': { entidad: 'categoria' },
  'categoria.campos_extra': { entidad: 'categoria' }, // SPEC 14
  'zona.crear': { entidad: 'zona' },
  'zona.editar': { entidad: 'zona' },
  'politica_sla.reemplazar': { entidad: 'categoria' }, // SPEC 29
  'parametro.actualizar': { entidad: 'parametro' }, // SPEC 15
  // Reservadas para SPEC 42: sesion.*, usuario.registrar, password.*, comentario.*, adjunto.*
} as const;

export type AccionBitacora = keyof typeof ACCIONES_BITACORA;
export type EntidadBitacora = (typeof ACCIONES_BITACORA)[AccionBitacora]['entidad'];

export const CLAVES_ACCIONES = Object.keys(ACCIONES_BITACORA) as AccionBitacora[];
export const ENTIDADES_BITACORA = [...new Set(CLAVES_ACCIONES.map((a) => ACCIONES_BITACORA[a].entidad))] as EntidadBitacora[];

// El mismo formato que el CHECK de la base.
export const FORMATO_ACCION = /^[a-z_]+\.[a-z_]+$/;

export function esAccionBitacora(valor: string): valor is AccionBitacora {
  return Object.prototype.hasOwnProperty.call(ACCIONES_BITACORA, valor);
}
