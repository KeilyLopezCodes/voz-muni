// Plantilla de correo guardada en plantillas_notificacion (RF-33). Los textos nunca viven en el código.
export interface Plantilla {
  clave: string;
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml: string;
}

export interface CorreoRenderizado {
  asunto: string;
  texto: string;
  html: string;
}

const VARIABLE = /\{\{(\w+)\}\}/g;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter]);
}

function reemplazar(
  plantilla: Plantilla,
  texto: string,
  variables: Record<string, string>,
  escapar: (valor: string) => string,
): string {
  return texto.replace(VARIABLE, (_coincidencia, nombre: string) => {
    if (!Object.hasOwn(variables, nombre)) {
      // Mejor fallar que enviar un correo con {{...}} visible.
      throw new Error(`La plantilla ${plantilla.clave} usa {{${nombre}}}, pero no se le dio valor`);
    }
    return escapar(variables[nombre]);
  });
}

// Reemplaza {{variable}}; en html escapa & < > " '. Una variable sin valor lanza error.
export function renderizar(plantilla: Plantilla, variables: Record<string, string>): CorreoRenderizado {
  const sinEscapar = (valor: string) => valor;
  return {
    asunto: reemplazar(plantilla, plantilla.asunto, variables, sinEscapar),
    texto: reemplazar(plantilla, plantilla.cuerpoTexto, variables, sinEscapar),
    html: reemplazar(plantilla, plantilla.cuerpoHtml, variables, escaparHtml),
  };
}
