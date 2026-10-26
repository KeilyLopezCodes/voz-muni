import type { MatrizSla, PlazoSla } from '../sla/politica-sla';

export interface CategoriaConSla {
  categoria: { id: number; nombre: string; activa: boolean };
  dependencia: { id: number; nombre: string };
  plazos: PlazoSla[]; // las filas que existan, en el orden de PRIORIDADES (0 a 4)
  completa: boolean; // tiene las 4 prioridades
  actualizadoEn: Date | null; // el máximo de sus filas
  actualizadoPor: { id: number; nombre: string } | null; // el autor de la fila más reciente
}

// Políticas de SLA por categoría (SPEC 29). Se usa dentro de una Transaccion para reemplazar la matriz.
export interface PoliticaSlaRepository {
  listarPorCategoria(): Promise<CategoriaConSla[]>;
  obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null>;
  // En la transacción del servicio: bloquea la categoría y hace upsert de las 4 filas.
  reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<void>;
}
