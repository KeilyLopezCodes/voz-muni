import type { DatosVecinoNuevo } from '../usuarios/vecino';

// Vecinos (usuarios con rol vecino) para el registro de quejas a su nombre (SPEC 12) y su alta en ventanilla (SPEC 13).
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
  // Coincidencia exacta (email en minúsculas, teléfono ya normalizado), solo vecinos activos, como máximo `limite`.
  buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]>;
  // Crea un vecino activo, sin contraseña ni dependencia, con datos ya validados (validarVecinoNuevo).
  // Lanza ReglaDeNegocioError EMAIL_DUPLICADO o DPI_DUPLICADO si ya pertenecen a cualquier usuario.
  crear(datos: DatosVecinoNuevo): Promise<{ id: number }>;
}
