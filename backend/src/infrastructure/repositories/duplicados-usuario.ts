import { ReglaDeNegocioError } from '../../domain/errors/regla-de-negocio-error';

const UNIQUE_VIOLATION = '23505';

// Traduce la violación de UNIQUE de usuarios a un error de negocio sin datos del registro existente (SPEC 10 y 13).
export function traducirDuplicadoUsuario(error: unknown): never {
  const { code, constraint } = (error ?? {}) as { code?: string; constraint?: string };
  if (code === UNIQUE_VIOLATION && constraint === 'usuarios_email_lower_unique') {
    throw new ReglaDeNegocioError('EMAIL_DUPLICADO', 'Ya existe un usuario con ese correo');
  }
  if (code === UNIQUE_VIOLATION && constraint === 'usuarios_dpi_key') {
    throw new ReglaDeNegocioError('DPI_DUPLICADO', 'Ya existe un usuario con ese DPI');
  }
  throw error;
}
