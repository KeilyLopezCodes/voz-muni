// Mismos nombres que frontend/src/shared/auth/roles.ts. Los carga la migración 0006_roles.
export const ROLES = ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'] as const;

export type Rol = (typeof ROLES)[number];
