import type { CriterioVecino, Vecino, VecinoRepository } from '../../domain/repositories/vecino-repository';
import { normalizarDpi } from '../../domain/usuarios/usuario-interno';
import type { VecinoEncontrado } from '../dto/registro-ticket.dto';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

export const MAX_VECINOS_ENCONTRADOS = 10;

// a***@dominio.gt: primer carácter + *** + @dominio.
export function enmascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  return `${email.charAt(0)}***${email.slice(arroba)}`;
}

// ****0000: solo los 4 últimos dígitos.
export function enmascararTelefono(telefono: string): string {
  return `****${telefono.replace(/\D/g, '').slice(-4)}`;
}

function aEncontrado(vecino: Vecino): VecinoEncontrado {
  return {
    id: vecino.id,
    nombre: vecino.nombre,
    email: vecino.email === null ? null : enmascararEmail(vecino.email),
    telefono: vecino.telefono === null ? null : enmascararTelefono(vecino.telefono),
  };
}

// Búsqueda de vecinos para registrar quejas a su nombre (SPEC 12). El DPI nunca se devuelve (RNF-12).
export class VecinosService {
  constructor(private readonly vecinos: VecinoRepository) {}

  async buscar(criterio: CriterioVecino): Promise<{ datos: VecinoEncontrado[] }> {
    return conReglasDeNegocio(async () => {
      const normalizado: CriterioVecino =
        'email' in criterio
          ? { email: criterio.email.toLowerCase() }
          : 'dpi' in criterio
            ? { dpi: normalizarDpi(criterio.dpi) }
            : criterio;
      const encontrados = await this.vecinos.buscarActivos(normalizado, MAX_VECINOS_ENCONTRADOS);
      return { datos: encontrados.map(aEncontrado) };
    });
  }
}
