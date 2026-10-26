import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { normalizarTelefono } from '../usuarios/vecino';

// El contacto con que el visitante prueba que la queja es suya (RF-35, SPEC 37): el correo o el teléfono del
// solicitante.
export type ContactoConsulta = { tipo: 'email'; valor: string } | { tipo: 'telefono'; valor: string };

export const CONTACTO_MAX = 254;

// Con @ es un correo (recortado y en minúsculas); si no, un teléfono de 8 dígitos (SPEC 13). Un teléfono mal formado
// lanza TELEFONO_INVALIDO antes de buscar la queja: el error no revela nada de ella.
export function interpretarContacto(contacto: string): ContactoConsulta {
  const recortado = contacto.trim();
  if (recortado === '' || [...recortado].length > CONTACTO_MAX) {
    throw new ReglaDeNegocioError('CONTACTO_REQUERIDO', `El contacto debe tener de 1 a ${CONTACTO_MAX} caracteres`);
  }
  if (recortado.includes('@')) {
    return { tipo: 'email', valor: recortado.toLowerCase() };
  }
  return { tipo: 'telefono', valor: normalizarTelefono(recortado) };
}

// true si el contacto es el del solicitante. Los teléfonos se guardan normalizados (SPEC 13).
export function contactoCoincide(
  contacto: ContactoConsulta,
  solicitante: { email: string | null; telefono: string | null },
): boolean {
  if (contacto.tipo === 'email') {
    return solicitante.email !== null && solicitante.email.trim().toLowerCase() === contacto.valor;
  }
  return solicitante.telefono !== null && solicitante.telefono === contacto.valor;
}

// Formato de los números de queja (SPEC 12). Se acepta en minúsculas y se normaliza a mayúsculas.
export const PATRON_NUMERO_QUEJA = /^Q-\d{4}-\d{6}$/;

export function normalizarNumeroQueja(numero: string): string {
  return numero.trim().toUpperCase();
}
