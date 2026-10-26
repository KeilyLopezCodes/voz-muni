import { enmascararEmail, enmascararTelefono } from '../usuarios/enmascarar-contacto';

// Qué guarda el detalle de la bitácora (RF-42, RNF-12, SPEC 41): solo lo que cambió, sin secretos, con los datos
// personales enmascarados y los textos largos truncados.

export type Cambios = Record<string, { antes: unknown; despues: unknown }>;

export interface DetalleBitacora {
  cambios?: Cambios;
  datos?: Record<string, unknown>;
}

export const LARGO_MAXIMO_TEXTO = 200;

const SECRETOS = new Set(['password', 'password_hash', 'passwordHash', 'token', 'token_hash', 'tokenHash', 'refreshToken']);

const esSecreto = (clave: string) => SECRETOS.has(clave) || clave.endsWith('_hash') || clave.endsWith('Hash');

// *********0101: solo los 4 últimos dígitos.
const enmascararDpi = (dpi: string) => `${'*'.repeat(Math.max(0, dpi.length - 4))}${dpi.slice(-4)}`;

const MASCARAS: Readonly<Record<string, (valor: string) => string>> = {
  dpi: enmascararDpi,
  telefono: enmascararTelefono,
  email: enmascararEmail,
  correo: enmascararEmail,
};

const truncar = (texto: string) =>
  [...texto].length > LARGO_MAXIMO_TEXTO ? `${[...texto].slice(0, LARGO_MAXIMO_TEXTO).join('')}…` : texto;

const sonIguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Solo los campos distintos entre dos instantáneas. Sin `antes` (un registro nuevo), cada campo de `despues` es un
// cambio desde null.
export function calcularCambios(antes: Record<string, unknown> | null, despues: Record<string, unknown>): Cambios {
  const cambios: Cambios = {};
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues)]);
  for (const clave of claves) {
    const valorAntes = antes?.[clave] ?? null;
    const valorDespues = despues[clave] ?? null;
    if (!sonIguales(valorAntes, valorDespues)) {
      cambios[clave] = { antes: valorAntes, despues: valorDespues };
    }
  }
  return cambios;
}

// En profundidad: la máscara de una clave (por ejemplo `telefono`) se aplica también a lo que hay debajo
// (`cambios.telefono.antes` y `.despues`).
function sanearValor(valor: unknown, mascara: ((valor: string) => string) | null): unknown {
  if (typeof valor === 'string') {
    return truncar(mascara ? mascara(valor) : valor);
  }
  if (Array.isArray(valor)) {
    return valor.map((elemento) => sanearValor(elemento, mascara));
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  if (valor !== null && typeof valor === 'object') {
    const resultado: Record<string, unknown> = {};
    for (const [clave, interior] of Object.entries(valor)) {
      if (esSecreto(clave)) {
        continue;
      }
      resultado[clave] = sanearValor(interior, MASCARAS[clave] ?? mascara);
    }
    return resultado;
  }
  return valor;
}

// Se aplica siempre dentro de Auditoria.registrar: ningún caso de uso puede saltárselo.
export function sanearDetalle(detalle: DetalleBitacora): DetalleBitacora {
  const saneado: DetalleBitacora = {};
  if (detalle.cambios && Object.keys(detalle.cambios).length > 0) {
    saneado.cambios = sanearValor(detalle.cambios, null) as Cambios;
  }
  if (detalle.datos && Object.keys(detalle.datos).length > 0) {
    saneado.datos = sanearValor(detalle.datos, null) as Record<string, unknown>;
  }
  return saneado;
}
