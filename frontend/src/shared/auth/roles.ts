// Mismos nombres que la migración 0006_roles del backend (SPEC 08) y backend/src/domain/auth/roles.ts.
export const ROLES = [
  'vecino',
  'receptor',
  'tecnico',
  'coordinador',
  'supervisor',
  'administrador',
] as const

export type Rol = (typeof ROLES)[number]
