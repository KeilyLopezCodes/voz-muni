// Parámetros municipales por clave (SPEC 15). Cada clave se valida en el dominio antes de guardarse.
export interface ParametroRepository {
  // null si la clave no existe.
  obtener(clave: string): Promise<unknown | null>;
  // Upsert: crea la clave o reemplaza su valor, y actualiza actualizado_en.
  guardar(clave: string, valor: unknown): Promise<void>;
}
