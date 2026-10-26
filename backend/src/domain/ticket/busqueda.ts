import { normalizarNumeroQueja, PATRON_NUMERO_QUEJA } from '../consulta/contacto-consulta';

// Búsqueda de quejas por número o título (RF-36, SPEC 38).

export const BUSQUEDA_MIN = 2;
export const BUSQUEDA_MAX = 100;

// Un número completo se busca exacto; cualquier otro texto, como subcadena del título o del número.
export type Busqueda = { tipo: 'numero'; numero: string } | { tipo: 'texto'; patron: string };

// `q` ya recortado y con su largo validado. El patrón es para ILIKE con `\` como escape (el de PostgreSQL por
// defecto): %, _ y \ se buscan literalmente.
export function interpretarBusqueda(q: string): Busqueda {
  const numero = normalizarNumeroQueja(q);
  if (PATRON_NUMERO_QUEJA.test(numero)) {
    return { tipo: 'numero', numero };
  }
  return { tipo: 'texto', patron: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
}
