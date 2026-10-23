// Mismos valores que el CHECK de tickets.canal de SPEC 03.
export const CANALES = ['portal', 'ventanilla', 'telefono', 'redes', 'correo'] as const;

export type Canal = (typeof CANALES)[number];

// portal queda para el vecino que registra para sí; los demás, para quien registra a nombre de un vecino (SPEC 12).
export const CANALES_INTERNOS: readonly Canal[] = ['ventanilla', 'telefono', 'redes', 'correo'];
