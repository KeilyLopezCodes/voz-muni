// Mismos nombres que el seed 01_roles de SPEC 03.
export const ROLES = [
  'vecino',
  'receptor',
  'tecnico',
  'coordinador',
  'supervisor',
  'administrador',
] as const

export type Rol = (typeof ROLES)[number]
