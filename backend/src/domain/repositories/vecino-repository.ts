// Vecinos (usuarios con rol vecino) para el registro de quejas a su nombre (SPEC 12).
export interface Vecino {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
}

export type CriterioVecino = { email: string } | { telefono: string } | { dpi: string };

export interface VecinoRepository {
  // null si no existe, no es vecino o está inactivo.
  obtenerActivo(id: number): Promise<Vecino | null>;
  // Coincidencia exacta (email en minúsculas), solo vecinos activos, como máximo `limite`.
  buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]>;
}
