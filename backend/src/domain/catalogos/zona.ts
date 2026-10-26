// Los tipos de zona son fijos: los define el CHECK de zonas (0001). Administrarlos queda fuera de RF-41 (SPEC 40).
export const TIPOS_ZONA = ['zona', 'colonia', 'aldea'] as const;

export type TipoZona = (typeof TIPOS_ZONA)[number];
