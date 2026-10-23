import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Reglas de los usuarios internos que gestiona el administrador (RF-04, SPEC 10).
// vecino no se asigna aquí: los vecinos se registran solos (RF-01) o en ventanilla (RF-07).
export const ROLES_INTERNOS = ['receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];

// La matriz de la sección 2 solo limita a su dependencia a estos roles.
export const ROLES_CON_DEPENDENCIA: readonly RolInterno[] = ['tecnico', 'coordinador'];

export function esRolInterno(rol: string): rol is RolInterno {
  return (ROLES_INTERNOS as readonly string[]).includes(rol);
}

// Lanza DEPENDENCIA_REQUERIDA si el rol la exige y es null, DEPENDENCIA_NO_PERMITIDA si el rol no la admite y no es null.
export function validarAsignacion(rol: RolInterno, dependenciaId: number | null): void {
  const requiere = ROLES_CON_DEPENDENCIA.includes(rol);
  if (requiere && dependenciaId === null) {
    throw new ReglaDeNegocioError('DEPENDENCIA_REQUERIDA', `El rol ${rol} necesita una dependencia`);
  }
  if (!requiere && dependenciaId !== null) {
    throw new ReglaDeNegocioError('DEPENDENCIA_NO_PERMITIDA', `El rol ${rol} no lleva dependencia`);
  }
}

// Quita espacios; devuelve los 13 dígitos o lanza DPI_INVALIDO. El dígito verificador no se valida.
export function normalizarDpi(dpi: string): string {
  const normalizado = dpi.replace(/\s+/g, '');
  if (!/^\d{13}$/.test(normalizado)) {
    throw new ReglaDeNegocioError('DPI_INVALIDO', 'El DPI debe tener 13 dígitos');
  }
  return normalizado;
}

export interface ProteccionAdmin {
  actorId: number;
  objetivoId: number;
  objetivoEsAdminActivo: boolean;
  quedaraAdminActivo: boolean; // después de la operación
  adminsActivos: number; // antes de la operación
}

// Nadie se desactiva ni se quita el rol administrador a sí mismo, y nunca quedan 0 administradores activos.
export function verificarProteccionAdmin(p: ProteccionAdmin): void {
  const pierdeAdmin = p.objetivoEsAdminActivo && !p.quedaraAdminActivo;
  if (!pierdeAdmin) {
    return;
  }
  if (p.actorId === p.objetivoId) {
    throw new ReglaDeNegocioError(
      'OPERACION_SOBRE_SI_MISMO',
      'Un administrador no puede desactivarse ni quitarse el rol a sí mismo',
    );
  }
  if (p.adminsActivos <= 1) {
    throw new ReglaDeNegocioError('ULTIMO_ADMINISTRADOR', 'La operación dejaría el sistema sin administradores activos');
  }
}
