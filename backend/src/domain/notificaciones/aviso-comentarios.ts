// Avisos al vecino de los comentarios públicos de su queja (RF-31, SPEC 35). El primer comentario se avisa al
// instante y abre una ventana; los que llegan dentro de ella se juntan en un solo correo cuando se cierra. Así una
// conversación activa recibe como máximo un correo por ventana.

export const VENTANA_MIN_MINUTOS = 1;
export const VENTANA_MAX_MINUTOS = 1440;

export interface EstadoAvisoComentarios {
  avisoComentarioEn: Date | null; // cuándo se encoló el último aviso
  pendientes: number; // comentarios llegados dentro de la ventana, todavía sin avisar
}

export type DecisionAviso =
  | { tipo: 'enviar_ahora'; nuevoEstado: EstadoAvisoComentarios } // aviso de 1 comentario
  | { tipo: 'acumular'; nuevoEstado: EstadoAvisoComentarios };

const MINUTO_MS = 60_000;

// La ventana del último aviso terminó (el borde ya cuenta como cerrada).
function ventanaCerrada(avisoComentarioEn: Date | null, ahora: Date, ventanaMin: number): boolean {
  return avisoComentarioEn === null || ahora.getTime() >= avisoComentarioEn.getTime() + ventanaMin * MINUTO_MS;
}

// Un comentario público nuevo de alguien que no es el solicitante.
export function alComentar(estado: EstadoAvisoComentarios, ahora: Date, ventanaMin: number): DecisionAviso {
  if (ventanaCerrada(estado.avisoComentarioEn, ahora, ventanaMin)) {
    return { tipo: 'enviar_ahora', nuevoEstado: { avisoComentarioEn: ahora, pendientes: 0 } };
  }
  return { tipo: 'acumular', nuevoEstado: { avisoComentarioEn: estado.avisoComentarioEn, pendientes: estado.pendientes + 1 } };
}

// true si la ventana del último aviso terminó y hay comentarios pendientes.
export function debeEnviarAgrupado(estado: EstadoAvisoComentarios, ahora: Date, ventanaMin: number): boolean {
  return estado.pendientes > 0 && ventanaCerrada(estado.avisoComentarioEn, ahora, ventanaMin);
}

// aviso_comentarios_ventana_minutos debe ser un entero de 1 a 1440. null si no lo es.
export function ventanaValida(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= VENTANA_MIN_MINUTOS && valor <= VENTANA_MAX_MINUTOS
    ? valor
    : null;
}
