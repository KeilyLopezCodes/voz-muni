import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { normalizarDpi } from './usuario-interno';

// Datos de un vecino dado de alta en ventanilla (RF-07, SPEC 13).
export interface DatosVecinoNuevo {
  nombre: string;
  dpi: string;
  email: string | null;
  telefono: string | null;
}

// Forma simple de un correo: texto@dominio.tld, sin espacios. La validación estricta la hace Zod en la entrada.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Quita espacios y guiones; devuelve 8 dígitos (Guatemala) o lanza TELEFONO_INVALIDO.
export function normalizarTelefono(telefono: string): string {
  const normalizado = telefono.replace(/[\s-]+/g, '');
  if (!/^\d{8}$/.test(normalizado)) {
    throw new ReglaDeNegocioError('TELEFONO_INVALIDO', 'El teléfono debe tener 8 dígitos');
  }
  return normalizado;
}

// Recorta el nombre, normaliza DPI, teléfono y correo, y exige al menos un medio de contacto.
export function validarVecinoNuevo(datos: DatosVecinoNuevo): DatosVecinoNuevo {
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  if ([...nombre].length < 1 || [...nombre].length > 150) {
    throw new ReglaDeNegocioError('NOMBRE_INVALIDO', 'El nombre debe tener de 1 a 150 caracteres');
  }
  const dpi = normalizarDpi(datos.dpi ?? '');

  const email = datos.email === null ? null : datos.email.trim().toLowerCase();
  if (email !== null && !CORREO.test(email)) {
    throw new ReglaDeNegocioError('EMAIL_INVALIDO', 'El correo no es válido');
  }
  const telefono = datos.telefono === null ? null : normalizarTelefono(datos.telefono);

  if (email === null && telefono === null) {
    throw new ReglaDeNegocioError('CONTACTO_REQUERIDO', 'Hay que dar un correo o un teléfono');
  }
  return { nombre, dpi, email, telefono };
}
